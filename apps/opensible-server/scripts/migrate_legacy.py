"""One-shot legacy migration: SQLite + JSON stores -> PostgreSQL (Fase 7 A3).

Reads the old `DATA_DIR` layout (auth.db, config.db, index.db, JSON stores,
stack-scoped files, executions) and inserts everything into the Postgres
schema. Idempotent: refuses to run when `schema_migrations` already has
version >= 1 AND target tables are non-empty, unless `--force` is given.

Usage:
    DATABASE_URL=postgres://... python scripts/migrate_legacy.py [--data-dir data] [--force]
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _log(msg: str) -> None:
    print(f"[migrate] {msg}")


# ---------------------------------------------------------------------------
# SQLite readers
# ---------------------------------------------------------------------------

def _sqlite_rows(db: Path, table: str) -> List[Dict[str, Any]]:
    if not db.exists():
        return []
    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    try:
        cols = [d[0] for d in conn.execute(f"SELECT * FROM {table} LIMIT 1").description]
        rows = [dict(r) for r in conn.execute(f"SELECT * FROM {table}").fetchall()]
        return [ {c: r.get(c) for c in cols} for r in rows ]
    except Exception:
        return []
    finally:
        conn.close()


def _sqlite_table_names(db: Path) -> List[str]:
    if not db.exists():
        return []
    conn = sqlite3.connect(str(db))
    try:
        return [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Target insert helpers
# ---------------------------------------------------------------------------

def _insert(table: str, rows: List[Dict[str, Any]], cols: List[str],
            upsert: bool = True) -> int:
    from storage import pg
    if not rows:
        return 0
    conflict = f" ON CONFLICT DO NOTHING" if upsert else ""
    with pg.transaction() as conn:
        for r in rows:
            placeholders = ", ".join(["%s"] * len(cols))
            sql = (f"INSERT INTO {table} ({', '.join(cols)}) "
                   f"VALUES ({placeholders}){conflict}")
            conn.execute(sql, [r.get(c) for c in cols])
    return len(rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=os.environ.get("DATA_DIR", "data"))
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    from storage import pg, pg_schema
    pg_schema.migrate()

    # Idempotency guard: if any key target table already has rows, skip unless --force.
    if not args.force:
        n_users = pg.query_one("SELECT COUNT(*) AS n FROM users") or {}
        n_kv = pg.query_one("SELECT COUNT(*) AS n FROM kv_store") or {}
        if (n_users.get("n") or 0) > 0 or (n_kv.get("n") or 0) > 0:
            _log("Target tables already populated. Use --force to re-run.")
            pg.reset_connection_pool()
            return 0

    t0 = time.time()

    # ---- auth.db ----
    auth_db = data_dir / "auth" / "auth.db"
    for table, cols in [
        ("users", ["id", "username", "email", "password_hash", "is_active",
                   "created_at", "updated_at", "last_login", "mfa_secret", "disabled_at"]),
        ("roles", ["id", "name", "description", "is_system", "created_at", "updated_at"]),
        ("permissions", ["id", "name", "description", "resource", "action", "created_at"]),
        ("user_roles", ["user_id", "role_id", "assigned_at"]),
        ("role_permissions", ["role_id", "permission_id"]),
        ("sessions", ["id", "user_id", "refresh_hash", "ip", "user_agent",
                      "created_at", "expires_at", "revoked_at"]),
        ("audit_log", ["id", "actor_user_id", "action", "target_type",
                       "target_id", "meta_json", "created_at"]),
    ]:
        rows = _sqlite_rows(auth_db, table)
        n = _insert(table, rows, cols)
        if n:
            _log(f"  auth.{table}: {n}")

    # ---- config.db ----
    config_db = data_dir / "config.db"
    projects = _sqlite_rows(config_db, "projects")
    proj_rows = []
    for p in projects:
        try:
            data = json.loads(p.get("data_json") or "{}")
        except Exception:
            data = {}
        proj_rows.append({
            "id": p.get("id"),
            "org_id": None,
            "owner_id": data.get("createdBy") or None,
            "name": data.get("name"),
            "description": data.get("description"),
            "is_archived": 1 if data.get("isArchived") else 0,
            "created_at": p.get("created_at"),
            "updated_at": p.get("updated_at"),
        })
    n = _insert("projects", proj_rows,
                ["id", "org_id", "owner_id", "name", "description",
                 "is_archived", "created_at", "updated_at"])
    if n:
        _log(f"  config.projects: {n}")

    settings = _sqlite_rows(config_db, "settings")
    n = _insert("settings", settings, ["key", "value_json", "updated_at"])
    if n:
        _log(f"  config.settings: {n}")

    # ---- JSON stores -> kv_store ----
    json_map = {
        "feature_flags.json": "flags",
        "flag_audit.json": "flag_audit",
        "test_cases.json": "test_cases",
        "test_results.json": "test_results",
        "quotas.json": "quotas",
        "budgets.json": "budgets",
        "retry_policy.json": "retry_policy",
        "env_roles.json": "env_roles",
        "byoc_accounts.json": "byoc",
        "automation_rules.json": "automation_rules",
        "inbound_webhooks.json": "inbound_webhooks",
        "webhooks.json": "webhooks",
        "preview_envs.json": "preview_envs",
        "notif_prefs.json": "notif_prefs",
        "oidc_config.json": "oidc_config",
        "bastion.json": "bastion",
        "provider_mirror.json": "provider_mirror",
        "roles-config.json": "roles_config",
        "projects.json": "projects_json",
    }
    kv_total = 0
    with pg.transaction() as conn:
        for fname, scope in json_map.items():
            p = data_dir / fname
            if not p.exists():
                continue
            try:
                value = json.loads(p.read_text(encoding="utf-8"))
            except Exception as e:
                _log(f"  kv.{scope}: SKIP (unreadable: {e})")
                continue
            key = "default"
            if isinstance(value, dict):
                # dict keyed by id -> store each entry under its own key.
                for k, v in value.items():
                    conn.execute(
                        "INSERT INTO kv_store (scope, key, value, updated_at) "
                        "VALUES (%s,%s,%s,%s) ON CONFLICT (scope, key) DO NOTHING",
                        (scope, str(k), json.dumps(v), time.time()))
                    kv_total += 1
            else:
                conn.execute(
                    "INSERT INTO kv_store (scope, key, value, updated_at) "
                    "VALUES (%s,%s,%s,%s) ON CONFLICT (scope, key) DO NOTHING",
                    (scope, key, json.dumps(value), time.time()))
                kv_total += 1
    if kv_total:
        _log(f"  kv_store: {kv_total} records")

    # ---- stack-scoped (best effort) ----
    stack_root = data_dir / "cloud-provisioning" / "default" / "envs"
    stack_meta_total = 0
    if stack_root.exists():
        with pg.transaction() as conn:
            for env in stack_root.iterdir():
                if not env.is_dir() or env.name.startswith("."):
                    continue
                meta_file = data_dir / "cloud-provisioning" / "default" / env.name / "meta.json"
                if meta_file.exists():
                    try:
                        meta = json.loads(meta_file.read_text(encoding="utf-8"))
                    except Exception:
                        meta = {}
                    conn.execute(
                        "INSERT INTO stack_meta (project_id, stack, data) "
                        "VALUES (%s,%s,%s) ON CONFLICT (project_id, stack) DO NOTHING",
                        ("default", env.name, json.dumps(meta)))
                    stack_meta_total += 1
        if stack_meta_total:
            _log(f"  stack_meta: {stack_meta_total}")

    # ---- executions (best effort) ----
    exec_total = 0
    ex_roots = [data_dir / "executions"]
    proj_dir = data_dir / "projects"
    if proj_dir.exists():
        for pid_dir in proj_dir.iterdir():
            h = pid_dir / "history" / "executions"
            if h.exists():
                ex_roots.append(h)
    with pg.transaction() as conn:
        for ex_root in ex_roots:
            if not ex_root.exists():
                continue
            for f in ex_root.glob("*.json"):
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                except Exception:
                    continue
                conn.execute(
                    "INSERT INTO executions (id, project_id, data, created_at) "
                    "VALUES (%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
                    (f.stem, data.get("project_id") or "default",
                     json.dumps(data), data.get("created_at") or time.time()))
                exec_total += 1
    if exec_total:
        _log(f"  executions: {exec_total}")

    _log(f"Done in {time.time() - t0:.1f}s. DATA_DIR={data_dir}")
    pg.reset_connection_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
