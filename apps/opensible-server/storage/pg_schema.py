"""PostgreSQL schema + versioned migrations (Fase 7).

`migrate()` applies pending versions in order (tracked in
`schema_migrations`). Version 1 creates every table the server needs:
auth/RBAC, config/projects, worker index, kv_store (JSON-config services),
executions/logs, stack-scoped data (meta/secrets/state/snapshots), and the
org tables for multi-tenancy (Fase D).
"""
from __future__ import annotations

import logging
from typing import List

from storage import pg

logger = logging.getLogger(__name__)

# Version 1 — full initial schema.
_V1_DDL: List[str] = [
    # ------------------------------------------------------------------ auth
    """CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT,
        last_login TEXT,
        mfa_secret TEXT,
        disabled_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        is_system INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        resource TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS user_roles (
        user_id TEXT REFERENCES users(id),
        role_id TEXT REFERENCES roles(id),
        assigned_at TEXT,
        PRIMARY KEY (user_id, role_id)
    )""",
    """CREATE TABLE IF NOT EXISTS role_permissions (
        role_id TEXT REFERENCES roles(id),
        permission_id TEXT REFERENCES permissions(id),
        PRIMARY KEY (role_id, permission_id)
    )""",
    """CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id),
        refresh_hash TEXT UNIQUE,
        ip TEXT,
        user_agent TEXT,
        created_at TEXT,
        expires_at TEXT,
        revoked_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        actor_user_id TEXT,
        action TEXT,
        target_type TEXT,
        target_id TEXT,
        meta_json TEXT,
        created_at TEXT
    )""",
    # --------------------------------------------------------------- config
    """CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        org_id TEXT,
        owner_id TEXT,
        name TEXT,
        description TEXT,
        is_archived INTEGER DEFAULT 0,
        created_at REAL,
        updated_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT
    )""",
    # -------------------------------------------------------- worker index
    """CREATE TABLE IF NOT EXISTS queued_executions (
        execution_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        queued_at REAL NOT NULL,
        requirements TEXT
    )""",
    """CREATE INDEX IF NOT EXISTS idx_queued_project ON queued_executions(project_id, queued_at)""",
    """CREATE TABLE IF NOT EXISTS running_executions (
        execution_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        started_at REAL NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS execution_locations (
        execution_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT,
        worker_id TEXT,
        updated_at REAL NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS worker_tokens (
        token_hash TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        salt TEXT NOT NULL
    )""",
    # ------------------------------------------------------------- kv_store
    """CREATE TABLE IF NOT EXISTS kv_store (
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        value jsonb NOT NULL,
        updated_at REAL,
        PRIMARY KEY (scope, key)
    )""",
    # ------------------------------------------------------ executions/logs
    """CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        data jsonb NOT NULL,
        created_at REAL
    )""",
    """CREATE TABLE IF NOT EXISTS execution_logs (
        execution_id TEXT NOT NULL,
        chunk INTEGER NOT NULL,
        data bytea NOT NULL,
        PRIMARY KEY (execution_id, chunk)
    )""",
    # ------------------------------------------------------ stack-scoped
    """CREATE TABLE IF NOT EXISTS stack_meta (
        project_id TEXT NOT NULL,
        stack TEXT NOT NULL,
        data jsonb NOT NULL,
        PRIMARY KEY (project_id, stack)
    )""",
    """CREATE TABLE IF NOT EXISTS stack_secrets (
        project_id TEXT NOT NULL,
        stack TEXT NOT NULL,
        data bytea NOT NULL,
        PRIMARY KEY (project_id, stack)
    )""",
    """CREATE TABLE IF NOT EXISTS stack_state (
        project_id TEXT NOT NULL,
        stack TEXT NOT NULL,
        data jsonb,
        raw bytea,
        PRIMARY KEY (project_id, stack)
    )""",
    """CREATE TABLE IF NOT EXISTS snapshots (
        project_id TEXT NOT NULL,
        stack TEXT NOT NULL,
        ts REAL NOT NULL,
        data bytea NOT NULL,
        PRIMARY KEY (project_id, stack, ts)
    )""",
    # ------------------------------------------------------------- orgs (D)
    """CREATE TABLE IF NOT EXISTS orgs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT,
        created_at REAL
    )""",
    """CREATE TABLE IF NOT EXISTS org_members (
        org_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at REAL,
        PRIMARY KEY (org_id, user_id)
    )""",
    """CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id)""",
]

# Version 2 — fix timestamp precision: REAL (float4) truncated epoch values
# (e.g. 1786532773618 -> 1786532700000). Timestamps become DOUBLE PRECISION.
_V2_DDL: List[str] = [
    "ALTER TABLE projects ALTER COLUMN created_at TYPE DOUBLE PRECISION",
    "ALTER TABLE queued_executions ALTER COLUMN queued_at TYPE DOUBLE PRECISION",
    "ALTER TABLE running_executions ALTER COLUMN started_at TYPE DOUBLE PRECISION",
    "ALTER TABLE execution_locations ALTER COLUMN updated_at TYPE DOUBLE PRECISION",
    "ALTER TABLE kv_store ALTER COLUMN updated_at TYPE DOUBLE PRECISION",
    "ALTER TABLE executions ALTER COLUMN created_at TYPE DOUBLE PRECISION",
    "ALTER TABLE snapshots ALTER COLUMN ts TYPE DOUBLE PRECISION",
    "ALTER TABLE orgs ALTER COLUMN created_at TYPE DOUBLE PRECISION",
    "ALTER TABLE org_members ALTER COLUMN created_at TYPE DOUBLE PRECISION",
    "ALTER TABLE schema_migrations ALTER COLUMN applied_at TYPE DOUBLE PRECISION",
]


def migrate() -> None:
    """Apply pending schema migrations (idempotent)."""
    pg.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at REAL
        )
    """)
    import time

    applied = {r["version"] for r in pg.query_all("SELECT version FROM schema_migrations")}
    versions = [(1, _V1_DDL), (2, _V2_DDL)]
    for version, ddl in versions:
        if version in applied:
            continue
        with pg.transaction() as conn:
            for stmt in ddl:
                conn.execute(stmt)
            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (%s, %s)",
                (version, time.time()),
            )
        logger.info("Applied schema migration v%d", version)


def reset_schema() -> None:
    """Drop all tables (test helper) then re-apply schema."""
    with pg.transaction() as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
    migrate()
