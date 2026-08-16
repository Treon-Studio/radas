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


# Project creation must not use the legacy replace-all read/modify/write path.
# This advisory-lock key serializes creators across backend processes while the
# active-name check and INSERT happen in one database transaction.
_PROJECT_CREATE_LOCK_KEY = "radas.projects.create"


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

def _project_to_row(p: Dict[str, Any]) -> Dict[str, Any]:
    created = p.get("createdAt") or p.get("created_at")
    try:
        created_f = float(created) if created is not None else None
    except (TypeError, ValueError):
        created_f = None
    return {
        "id": p.get("id"),
        "org_id": p.get("org_id") or p.get("orgId"),
        "owner_id": p.get("owner_id") or p.get("createdBy"),
        "name": p.get("name"),
        "description": p.get("description"),
        "is_archived": 1 if p.get("isArchived") or p.get("is_archived") else 0,
        "created_at": created_f,
        "updated_at": p.get("updatedAt") or p.get("updated_at") or _now_iso(),
    }


def _row_to_project(r: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": r["id"],
        "org_id": r.get("org_id"),
        "owner_id": r.get("owner_id"),
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
    return [_row_to_project(r) for r in rows]


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
            (_PROJECT_CREATE_LOCK_KEY,),
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
    """Overwrite the projects table with the supplied list."""
    try:
        with pg.transaction() as conn:
            conn.execute("DELETE FROM projects")
            for p in items or []:
                pid = p.get("id")
                if not pid:
                    continue
                row = _project_to_row(p)
                conn.execute(
                    "INSERT INTO projects(id, org_id, owner_id, name, description, "
                    "is_archived, created_at, updated_at) "
                    "VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO UPDATE SET "
                    "org_id = EXCLUDED.org_id, owner_id = EXCLUDED.owner_id, "
                    "name = EXCLUDED.name, description = EXCLUDED.description, "
                    "is_archived = EXCLUDED.is_archived, "
                    "created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at",
                    (row["id"], row["org_id"], row["owner_id"], row["name"],
                     row["description"], row["is_archived"], row["created_at"],
                     row["updated_at"]),
                )
        return True
    except Exception as e:
        logger.error("config_db.replace_all_projects failed: %s", e)
        return False


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    r = pg.query_one(
        "SELECT id, org_id, owner_id, name, description, is_archived, "
        "created_at, updated_at FROM projects WHERE id = %s", (project_id,))
    return _row_to_project(r) if r else None


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
