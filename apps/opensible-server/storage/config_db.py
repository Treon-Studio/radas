"""PostgreSQL-backed store for projects list and app settings (Fase 7).

Replaces the legacy SQLite ``config.db`` (and the flat JSON files before it).
Schema lives in ``storage/pg_schema`` (projects, settings tables).

Public API — unchanged so callers swap in-place:

    list_projects(data_dir)                 -> list[dict]
    replace_all_projects(data_dir, items)   -> bool
    get_setting(data_dir, key, default)     -> Any   # JSON round-trip
    set_setting(data_dir, key, value)       -> bool
    migrate_from_json_if_needed(data_dir)   -> None  # one-shot import
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from storage import pg

logger = logging.getLogger(__name__)

_MIGRATED = False


class ProjectNameExistsError(RuntimeError):
    """Raised when an active project already uses the requested name."""


class ProjectRecord(dict):
    """A project mapping that carries a non-serialised read-snapshot marker.

    ``list(projects)`` and normal list operations retain the mapping objects,
    so old callers that turn ``ProjectList`` into an ordinary list still keep
    enough information for optimistic replace/delete matching.  The marker is
    an attribute rather than a dictionary key and therefore never changes the
    public JSON/list contract.
    """

    _snapshot_versions: Optional[Dict[str, Dict[str, Any]]] = None


class ProjectList(list):
    """Project list carrying the snapshot used by a legacy replace operation.

    Older callers still receive a normal list API, but the marker lets
    ``replace_all_projects`` distinguish rows that existed when the caller
    read from rows inserted concurrently afterwards.
    """

    def __init__(self, items, *, snapshot_ids=(), snapshot_versions=None):
        super().__init__(items)
        self.snapshot_ids = frozenset(snapshot_ids)
        self.snapshot_versions = dict(snapshot_versions or {})


# All project mutations use one transaction-level advisory lock.  This keeps
# the legacy replace-all API coordinated with atomic create/update/delete
# operations across backend processes.
_PROJECT_MUTATION_LOCK_KEY = "radas.projects.mutation"


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

def _project_to_row(p: Dict[str, Any], *, fill_updated_at: bool = True) -> Dict[str, Any]:
    created = p.get("createdAt") or p.get("created_at")
    try:
        created_f = float(created) if created is not None else None
    except (TypeError, ValueError):
        created_f = None
    updated_at = p.get("updatedAt") or p.get("updated_at")
    if updated_at is None and fill_updated_at:
        updated_at = _now_iso()
    return {
        "id": p.get("id"),
        "org_id": p.get("org_id") or p.get("orgId"),
        "owner_id": p.get("owner_id") or p.get("createdBy"),
        "name": p.get("name"),
        "description": p.get("description"),
        "is_archived": 1 if p.get("isArchived") or p.get("is_archived") else 0,
        "created_at": created_f,
        "updated_at": updated_at,
    }


def _row_to_project(r: Dict[str, Any]) -> Dict[str, Any]:
    org_id = r.get("org_id")
    owner_id = r.get("owner_id")
    return {
        "id": r["id"],
        "org_id": org_id,
        "orgId": org_id,
        "owner_id": owner_id,
        "createdBy": owner_id,
        "name": r.get("name"),
        "description": r.get("description"),
        "isArchived": bool(r.get("is_archived")),
        "createdAt": r.get("created_at"),
        "updatedAt": r.get("updated_at"),
    }


def list_projects(data_dir: Path) -> List[Dict[str, Any]]:
    rows = pg.query_all(
        "SELECT id, org_id, owner_id, name, description, is_archived, "
        "created_at, updated_at FROM projects "
        "ORDER BY COALESCE(created_at, 0) ASC, id ASC"
    )
    projects = [_row_to_project(r) for r in rows]
    return ProjectList(
        projects,
        snapshot_ids=(p["id"] for p in projects),
        snapshot_versions={p["id"]: dict(p) for p in projects},
    )


def create_project(data_dir: Path, project: Dict[str, Any]) -> Dict[str, Any]:
    """Insert one project without a destructive read/modify/write cycle.

    The advisory transaction lock keeps the legacy global active-name rule
    correct across backend processes. The row insert itself is committed as a
    single PostgreSQL transaction, so concurrent creators cannot overwrite one
    another's projects.
    """
    row = _project_to_row(project)
    with pg.transaction() as conn:
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (_PROJECT_MUTATION_LOCK_KEY,),
        )
        existing = conn.execute(
            "SELECT 1 FROM projects WHERE name = %s AND is_archived = 0 LIMIT 1",
            (row["name"],),
        ).fetchone()
        if existing:
            raise ProjectNameExistsError("Project with this name already exists")
        inserted = conn.execute(
            "INSERT INTO projects(id, org_id, owner_id, name, description, "
            "is_archived, created_at, updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) "
            "RETURNING id, org_id, owner_id, name, description, is_archived, "
            "created_at, updated_at",
            (row["id"], row["org_id"], row["owner_id"], row["name"],
             row["description"], row["is_archived"], row["created_at"],
             row["updated_at"]),
        ).fetchone()
    return _row_to_project(inserted)


def replace_all_projects(data_dir: Path, items: List[Dict[str, Any]]) -> bool:
    """Apply a legacy snapshot without clobbering newer project rows/fields.

    For snapshot-bearing lists, only apply fields that the caller changed while
    the database still has the corresponding snapshot value; deleted rows are
    removed only if unchanged. Plain lists (legacy callers) are treated as an
    atomic full replacement: rows in the supplied list become the new state;
    omitted rows are deleted; existing rows are updated, preserving concurrency
    through the advisory lock.
    """
    try:
        snapshot_ids = getattr(items, "snapshot_ids", None)
        snapshots = getattr(items, "snapshot_versions", {}) or {}
        supplied = {p.get("id"): p for p in (items or []) if p.get("id")}
        with pg.transaction() as conn:
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                (_PROJECT_MUTATION_LOCK_KEY,),
            )
            # For plain lists, we take a full snapshot under the lock.
            if snapshot_ids is None:
                current_rows = conn.execute(
                    "SELECT id, org_id, owner_id, name, description, is_archived, created_at, updated_at "
                    "FROM projects FOR UPDATE"
                ).fetchall()
                current_ids = {r["id"] for r in current_rows}
                to_delete = current_ids - set(supplied)
                for pid in to_delete:
                    conn.execute("DELETE FROM projects WHERE id = %s", (pid,))
                for project in items:
                    row = _project_to_row(project)
                    _ensure_active_name_available(conn, row["name"], row["id"])
                    conn.execute(
                        "INSERT INTO projects(id, org_id, owner_id, name, description, is_archived, created_at, updated_at) "
                        "VALUES(%s,%s,%s,%s,%s,%s,%s,%s) "
                        "ON CONFLICT (id) DO UPDATE SET "
                        "org_id=EXCLUDED.org_id, owner_id=EXCLUDED.owner_id, name=EXCLUDED.name, "
                        "description=EXCLUDED.description, is_archived=EXCLUDED.is_archived, "
                        "created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at",
                        (row["id"], row["org_id"], row["owner_id"], row["name"],
                         row["description"], row["is_archived"], row["created_at"], row["updated_at"]),
                    )
                return True

            # Snapshot-bearing list: optimistic merge.
            for pid in set(snapshot_ids) - set(supplied):
                current = conn.execute(
                    "SELECT id, org_id, owner_id, name, description, is_archived, created_at, updated_at "
                    "FROM projects WHERE id = %s FOR UPDATE", (pid,)
                ).fetchone()
                before = snapshots.get(pid)
                if current and before and _project_row_matches_snapshot(current, before):
                    conn.execute("DELETE FROM projects WHERE id = %s", (pid,))

            for pid, project in supplied.items():
                row = _project_to_row(project)
                current = conn.execute(
                    "SELECT id, org_id, owner_id, name, description, is_archived, created_at, updated_at "
                    "FROM projects WHERE id = %s FOR UPDATE", (pid,)
                ).fetchone()
                before = snapshots.get(pid)
                if current is None:
                    if before is not None:
                        continue
                    _ensure_active_name_available(conn, row["name"], pid)
                    conn.execute(
                        "INSERT INTO projects(id, org_id, owner_id, name, description, is_archived, created_at, updated_at) "
                        "VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                        (row["id"], row["org_id"], row["owner_id"], row["name"],
                         row["description"], row["is_archived"], row["created_at"], row["updated_at"]),
                    )
                    continue
                if before is None:
                    continue
                changes = {}
                before_row = _project_to_row(before, fill_updated_at=False)
                for field in ("org_id", "owner_id", "name", "description", "is_archived", "created_at"):
                    before_value = before_row[field]
                    supplied_value = row[field]
                    current_value = current[field]
                    if supplied_value != before_value and current_value == before_value:
                        changes[field] = supplied_value
                # updated_at: only advance if caller timestamp is newer than current.
                # For snapshot comparison, we preserve the original before timestamp.
                if changes and row["updated_at"] != before_row["updated_at"] and current["updated_at"] == before_row["updated_at"]:
                    changes["updated_at"] = row["updated_at"]
                if "is_archived" in changes:
                    changes["is_archived"] = 1 if changes["is_archived"] else 0
                if "name" in changes:
                    _ensure_active_name_available(conn, changes["name"], pid)
                if changes:
                    assignments = ", ".join(f"{field} = %s" for field in changes)
                    conn.execute(
                        f"UPDATE projects SET {assignments} WHERE id = %s",
                        (*changes.values(), pid),
                    )
        return True
    except Exception as e:
        logger.error("config_db.replace_all_projects failed: %s", e)
        return False


def _project_row_matches_snapshot(row: Dict[str, Any], snapshot: Dict[str, Any]) -> bool:
    expected = _project_to_row(snapshot, fill_updated_at=False)
    return all(row.get(field) == expected[field] for field in (
        "org_id", "owner_id", "name", "description", "is_archived",
        "created_at", "updated_at",
    ))


def _ensure_active_name_available(conn, name: Any, project_id: str) -> None:
    duplicate = conn.execute(
        "SELECT 1 FROM projects WHERE name = %s AND is_archived = 0 AND id <> %s LIMIT 1",
        (name, project_id),
    ).fetchone()
    if duplicate:
        raise ProjectNameExistsError("Project with this name already exists")


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    r = pg.query_one(
        "SELECT id, org_id, owner_id, name, description, is_archived, "
        "created_at, updated_at FROM projects WHERE id = %s", (project_id,))
    return _row_to_project(r) if r else None


def update_project(project_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Atomically update one project under the shared mutation lock."""
    allowed = {"name", "description", "isArchived", "is_archived", "updatedAt", "updated_at"}
    values = {key: value for key, value in updates.items() if key in allowed}
    if "isArchived" in values:
        values["is_archived"] = values.pop("isArchived")
    if "updatedAt" in values:
        values["updated_at"] = values.pop("updatedAt")
    if "is_archived" in values:
        values["is_archived"] = 1 if values["is_archived"] else 0
    if not values:
        return get_project(project_id)
    try:
        with pg.transaction() as conn:
            conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                (_PROJECT_MUTATION_LOCK_KEY,),
            )
            if "name" in values and values.get("is_archived", 0) == 0:
                _ensure_active_name_available(conn, values["name"], project_id)
            elif "is_archived" in values and not values["is_archived"]:
                current = conn.execute(
                    "SELECT name FROM projects WHERE id = %s", (project_id,)
                ).fetchone()
                if current:
                    _ensure_active_name_available(conn, current["name"], project_id)
            assignments = ", ".join(f"{key} = %s" for key in values)
            row = conn.execute(
                f"UPDATE projects SET {assignments} WHERE id = %s RETURNING id, org_id, owner_id, name, description, is_archived, created_at, updated_at",
                (*values.values(), project_id),
            ).fetchone()
        return _row_to_project(row) if row else None
    except ProjectNameExistsError:
        raise


def delete_project(project_id: str) -> bool:
    """Atomically delete one project under the shared mutation lock."""
    with pg.transaction() as conn:
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (_PROJECT_MUTATION_LOCK_KEY,),
        )
        result = conn.execute("DELETE FROM projects WHERE id = %s", (project_id,))
        return result.rowcount > 0


# ---------------------------------------------------------------------------
# Settings (key/value JSON blobs)
# ---------------------------------------------------------------------------

def get_setting(data_dir: Path, key: str, default: Any = None) -> Any:
    row = pg.query_one("SELECT value_json FROM settings WHERE key = %s", (key,))
    if not row:
        return default
    try:
        return json.loads(row["value_json"])
    except Exception:
        return default


def set_setting(data_dir: Path, key: str, value: Any) -> bool:
    try:
        pg.execute(
            "INSERT INTO settings(key, value_json, updated_at) VALUES(%s,%s,%s) "
            "ON CONFLICT(key) DO UPDATE SET value_json=EXCLUDED.value_json, "
            "updated_at=EXCLUDED.updated_at",
            (key, json.dumps(value, ensure_ascii=False), _now_iso()),
        )
        return True
    except Exception as e:
        logger.error("config_db.set_setting(%s) failed: %s", key, e)
        return False


# ---------------------------------------------------------------------------
# One-shot JSON -> DB migration
# ---------------------------------------------------------------------------

_SETTINGS_FILES = {
    "execution_settings": "execution_settings.json",
    "backup_settings": "backup_settings.json",
}


def migrate_from_json_if_needed(data_dir: Path) -> None:
    global _MIGRATED
    if _MIGRATED:
        return
    dd = Path(data_dir)
    try:
        projects_count = (pg.query_one("SELECT COUNT(*) AS n FROM projects") or {}).get("n") or 0
        pfile = dd / "projects.json"
        if projects_count == 0 and pfile.exists():
            try:
                raw = json.loads(pfile.read_text(encoding="utf-8"))
                items = raw.get("projects", []) if isinstance(raw, dict) else []
                if items:
                    replace_all_projects(dd, items)
                    logger.info("config_db migration: imported %d projects", len(items))
            except Exception as e:
                logger.warning("config_db migration: projects.json import failed: %s", e)

        for key, fname in _SETTINGS_FILES.items():
            if pg.query_one("SELECT 1 AS x FROM settings WHERE key = %s", (key,)):
                continue
            fpath = dd / fname
            if not fpath.exists():
                continue
            try:
                data = json.loads(fpath.read_text(encoding="utf-8"))
                set_setting(dd, key, data)
            except Exception as e:
                logger.warning("config_db migration: %s import failed: %s", fname, e)

        ts = int(time.time())
        for fname in ("projects.json", *_SETTINGS_FILES.values()):
            fpath = dd / fname
            if fpath.exists():
                try:
                    fpath.rename(fpath.with_suffix(f".json.migrated-{ts}"))
                except Exception as e:
                    logger.warning("config_db migration: rename %s failed: %s", fpath, e)
        _MIGRATED = True
    except Exception as e:
        logger.warning("config_db migration skipped due to error: %s", e)
        _MIGRATED = True
