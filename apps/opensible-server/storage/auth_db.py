"""
PostgreSQL-backed authentication store (Fase 7 — ported from SQLite).

Owns tables for the Users Management subsystem:

    users, roles, permissions,
    user_roles, role_permissions,
    api_tokens, sessions,
    audit_log

The schema lives in ``storage/pg_schema`` (versioned). This module exposes
the same public API as before so the service layer is unchanged:

  - ``get_conn(data_dir)`` : sqlite3-compatible connection over Postgres
    (``storage.pg_compat``) — ``?`` placeholders, ``row['col']``/``row[0]``.
  - ``audit(...)``         : append a row to ``audit_log``.
  - ``migrate_from_json_if_needed(data_dir)`` : one-shot legacy import from
    the pre-Postgres JSON files (best effort; normally the A3 script handles it).
  - ``now_iso()``          : ISO-8601 UTC timestamp helper.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_MIGRATED = False


def now_iso() -> str:
    return datetime.utcnow().isoformat()


def get_conn(data_dir: Path):
    """Return a sqlite3-compatible connection backed by Postgres."""
    from storage.pg_compat import get_conn as _get_compat
    return _get_compat()


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

def audit(
    data_dir: Path,
    action: str,
    *,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
    raise_on_error: bool = False,
) -> None:
    try:
        conn = get_conn(data_dir)
        try:
            conn.execute(
                "INSERT INTO audit_log(actor_user_id, action, target_type, target_id, meta_json, created_at) "
                "VALUES(?,?,?,?,?,?)",
                (
                    actor_user_id,
                    action,
                    target_type,
                    target_id,
                    json.dumps(meta, ensure_ascii=False) if meta else None,
                    now_iso(),
                ),
            )
        finally:
            conn.close()
    except Exception as e:
        if raise_on_error:
            raise
        logger.warning("audit insert failed (%s): %s", action, e)


def list_audit(
    data_dir: Path,
    *,
    limit: int = 100,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    conn = get_conn(data_dir)
    try:
        sql = "SELECT id, actor_user_id, action, target_type, target_id, meta_json, created_at FROM audit_log"
        where: List[str] = []
        args: List[Any] = []
        if target_type:
            where.append("target_type = ?")
            args.append(target_type)
        if target_id:
            where.append("target_id = ?")
            args.append(target_id)
        if actor_user_id:
            where.append("actor_user_id = ?")
            args.append(actor_user_id)
        if project_id:
            where.append("meta_json::jsonb ->> 'project_id' = ?")
            args.append(project_id)
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY id DESC LIMIT ?"
        args.append(int(limit))
        rows = conn.execute(sql, args).fetchall()
        out: List[Dict[str, Any]] = []
        for r in rows:
            meta = None
            if r["meta_json"]:
                try:
                    meta = json.loads(r["meta_json"])
                except Exception:
                    meta = None
            out.append(
                {
                    "id": r["id"],
                    "actor_user_id": r["actor_user_id"],
                    "action": r["action"],
                    "target_type": r["target_type"],
                    "target_id": r["target_id"],
                    "meta": meta,
                    "created_at": r["created_at"],
                }
            )
        return out
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# One-shot JSON -> DB migration (legacy users.json / roles.json / permissions.json)
# ---------------------------------------------------------------------------

def migrate_from_json_if_needed(data_dir: Path) -> None:
    """Import legacy JSON files when the tables are empty (best effort).

    Normally the A3 ``scripts/migrate_legacy.py`` handles the full migration;
    this helper remains for environments that only ever had JSON files.
    """
    global _MIGRATED
    if _MIGRATED:
        return
    auth_dir = Path(data_dir) / "auth"
    users_file = auth_dir / "users.json"
    roles_file = auth_dir / "roles.json"
    perms_file = auth_dir / "permissions.json"

    try:
        from storage import pg
        counts = {
            "users": (pg.query_one("SELECT COUNT(*) AS n FROM users") or {}).get("n") or 0,
            "roles": (pg.query_one("SELECT COUNT(*) AS n FROM roles") or {}).get("n") or 0,
            "permissions": (pg.query_one("SELECT COUNT(*) AS n FROM permissions") or {}).get("n") or 0,
        }
        if counts["permissions"] == 0 and perms_file.exists():
            _import_permissions(perms_file)
        if counts["roles"] == 0 and roles_file.exists():
            _import_roles(roles_file)
        if counts["users"] == 0 and users_file.exists():
            _import_users(users_file)
        ts = int(time.time())
        for f in (perms_file, roles_file, users_file):
            if f.exists():
                try:
                    f.rename(f.with_suffix(f".json.migrated-{ts}"))
                except Exception as e:
                    logger.warning("auth_db migration: rename %s failed: %s", f, e)
        _MIGRATED = True
    except Exception as e:
        logger.warning("auth_db migration skipped due to error: %s", e)
        _MIGRATED = True  # avoid retrying on every call


def _import_permissions(path: Path) -> None:
    from storage import pg
    data = json.loads(path.read_text(encoding="utf-8"))
    count = 0
    for pid, p in data.items():
        with pg.transaction() as conn:
            conn.execute(
                "INSERT INTO permissions(id,name,description,resource,action,created_at) "
                "VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
                (
                    p.get("id") or pid,
                    p.get("name"),
                    p.get("description", ""),
                    p.get("resource", ""),
                    p.get("action", ""),
                    p.get("created_at") or now_iso(),
                ),
            )
        count += 1
    logger.info("auth_db migration: imported %d permissions", count)


def _import_roles(path: Path) -> None:
    from storage import pg
    data = json.loads(path.read_text(encoding="utf-8"))
    count = 0
    for rid, r in data.items():
        role_id = r.get("id") or rid
        with pg.transaction() as conn:
            conn.execute(
                "INSERT INTO roles(id,name,description,is_system,created_at,updated_at) "
                "VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
                (
                    role_id,
                    r.get("name"),
                    r.get("description", ""),
                    1 if r.get("is_system") else 0,
                    r.get("created_at") or now_iso(),
                    r.get("updated_at") or now_iso(),
                ),
            )
            for perm_id in r.get("permissions") or []:
                conn.execute(
                    "INSERT INTO role_permissions(role_id,permission_id) VALUES(%s,%s) "
                    "ON CONFLICT DO NOTHING",
                    (role_id, perm_id),
                )
        count += 1
    logger.info("auth_db migration: imported %d roles", count)


def _import_users(path: Path) -> None:
    from storage import pg
    data = json.loads(path.read_text(encoding="utf-8"))
    count = 0
    for uid, u in data.items():
        user_id = u.get("id") or uid
        with pg.transaction() as conn:
            conn.execute(
                "INSERT INTO users("
                "id,username,email,password_hash,is_active,created_at,updated_at,last_login) "
                "VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
                (
                    user_id,
                    u.get("username"),
                    u.get("email"),
                    u.get("password_hash", ""),
                    1 if u.get("is_active", True) else 0,
                    u.get("created_at") or now_iso(),
                    u.get("updated_at") or now_iso(),
                    u.get("last_login"),
                ),
            )
            for role_id in u.get("roles") or []:
                exists = conn.execute("SELECT 1 FROM roles WHERE id = %s", (role_id,)).fetchone()
                if exists:
                    conn.execute(
                        "INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES(%s,%s,%s) "
                        "ON CONFLICT DO NOTHING",
                        (user_id, role_id, now_iso()),
                    )
        count += 1
    logger.info("auth_db migration: imported %d users", count)
