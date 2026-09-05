defmodule Radas.Repo.Migrations.BaselineCoreTables do
  @moduledoc """
  Baseline core schema (Phase 8 cutover): recreates the tables the Phoenix
  server shares with the retired Flask backend, ported from the historical
  `apps/server/storage/pg_schema.py` (versions 1–25, with V2's timestamp
  precision fixes and V6's projects FK/unique index folded in). All
  statements are IF NOT EXISTS, so running against a database that already
  carries the historical schema is a no-op apart from re-asserting the V6
  projects FK.

  Versions 1–25 are marked applied in the shared `schema_migrations` table
  (created here) for consistency with the historical Python migration
  runner; Ecto tracks its own migrations in `ecto_migrations`.

  Must run BEFORE `20260904000001_ai_router_tables_v26_to_v30`, whose tables
  carry `REFERENCES orgs(id)` — hence the earlier timestamp.
  """

  use Ecto.Migration

  @historical_versions Enum.to_list(1..25)

  def up do
    # Historical Python runner's tracking table (version INTEGER PRIMARY
    # KEY, applied_at DOUBLE PRECISION after V2). The V26–V30 migration
    # also inserts into it, so it must exist on fresh databases.
    execute("""
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at DOUBLE PRECISION
    )
    """)

    # ------------------------------------------------------------- V1: auth
    execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT,
        last_login TEXT,
        disabled_at TEXT
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS onboarding_status (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        completed_at DOUBLE PRECISION,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        is_system INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        resource TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at TEXT
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS user_roles (
        user_id TEXT REFERENCES users(id),
        role_id TEXT REFERENCES roles(id),
        assigned_at TEXT,
        PRIMARY KEY (user_id, role_id)
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS role_permissions (
        role_id TEXT REFERENCES roles(id),
        permission_id TEXT REFERENCES permissions(id),
        PRIMARY KEY (role_id, permission_id)
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id),
        refresh_hash TEXT UNIQUE,
        ip TEXT,
        user_agent TEXT,
        created_at TEXT,
        expires_at TEXT,
        revoked_at TEXT
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        actor_user_id TEXT,
        action TEXT,
        target_type TEXT,
        target_id TEXT,
        meta_json TEXT,
        created_at TEXT
    )
    """)

    # ------------------------------------------------- V1: config/projects
    execute("""
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        org_id TEXT,
        owner_id TEXT,
        name TEXT,
        description TEXT,
        is_archived INTEGER DEFAULT 0,
        created_at DOUBLE PRECISION,
        updated_at TEXT
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT
    )
    """)

    # ------------------------------------------------- V1: worker index
    execute("""
    CREATE TABLE IF NOT EXISTS queued_executions (
        execution_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        queued_at DOUBLE PRECISION NOT NULL,
        requirements TEXT
    )
    """)

    execute(
      "CREATE INDEX IF NOT EXISTS idx_queued_project ON queued_executions(project_id, queued_at)"
    )

    execute("""
    CREATE TABLE IF NOT EXISTS running_executions (
        execution_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        started_at DOUBLE PRECISION NOT NULL
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS execution_locations (
        execution_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT,
        worker_id TEXT,
        updated_at DOUBLE PRECISION NOT NULL
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS worker_tokens (
        token_hash TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        salt TEXT NOT NULL
    )
    """)

    # ------------------------------------------------------- V1: kv_store
    execute("""
    CREATE TABLE IF NOT EXISTS kv_store (
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        value jsonb NOT NULL,
        updated_at DOUBLE PRECISION,
        PRIMARY KEY (scope, key)
    )
    """)

    # --------------------------------------------- V1: executions & logs
    execute("""
    CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        data jsonb NOT NULL,
        created_at DOUBLE PRECISION
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS execution_logs (
        execution_id TEXT NOT NULL,
        chunk INTEGER NOT NULL,
        data bytea NOT NULL,
        PRIMARY KEY (execution_id, chunk)
    )
    """)

    # ------------------------------------------------- V1: stack-scoped
    execute("""
    CREATE TABLE IF NOT EXISTS stack_meta (
        project_id TEXT NOT NULL,
        stack TEXT NOT NULL,
        data jsonb NOT NULL,
        PRIMARY KEY (project_id, stack)
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS stack_secrets (
        project_id TEXT NOT NULL,
        stack TEXT NOT NULL,
        data bytea NOT NULL,
        PRIMARY KEY (project_id, stack)
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS stack_state (
        project_id TEXT NOT NULL,
        stack TEXT NOT NULL,
        data jsonb,
        raw bytea,
        PRIMARY KEY (project_id, stack)
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS snapshots (
        project_id TEXT NOT NULL,
        stack TEXT NOT NULL,
        ts DOUBLE PRECISION NOT NULL,
        data bytea NOT NULL,
        PRIMARY KEY (project_id, stack, ts)
    )
    """)

    # ----------------------------------------------------------- V1: orgs
    execute("""
    CREATE TABLE IF NOT EXISTS orgs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT,
        created_at DOUBLE PRECISION
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS org_members (
        org_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at DOUBLE PRECISION,
        PRIMARY KEY (org_id, user_id)
    )
    """)

    execute("CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id)")

    # ------------------------------------------------------- V22: leases
    execute("""
    CREATE TABLE IF NOT EXISTS project_admission_leases (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        worker_id TEXT,
        status TEXT NOT NULL,
        lease_until DOUBLE PRECISION,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        UNIQUE(kind, reference_id)
    )
    """)

    execute(
      "CREATE INDEX IF NOT EXISTS project_admission_leases_project_active_idx ON project_admission_leases(project_id, status, lease_until)"
    )

    # ------------------------------------------------- V23: project locks
    execute("""
    CREATE TABLE IF NOT EXISTS project_locks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        actor TEXT,
        operation TEXT NOT NULL,
        run_id TEXT,
        acquired_at REAL NOT NULL,
        expires_at REAL NOT NULL
    )
    """)

    execute(
      "CREATE INDEX IF NOT EXISTS idx_project_locks_project_expires ON project_locks(project_id, expires_at)"
    )

    # -------------------------------------------- V24: remote state locks
    execute("""
    CREATE TABLE IF NOT EXISTS remote_state_locks (
        id TEXT PRIMARY KEY,
        stack TEXT NOT NULL,
        backend_type TEXT NOT NULL,
        backend_key TEXT NOT NULL,
        actor TEXT,
        operation TEXT NOT NULL,
        run_id TEXT,
        acquired_at REAL NOT NULL,
        expires_at REAL NOT NULL
    )
    """)

    execute(
      "CREATE INDEX IF NOT EXISTS idx_remote_state_locks_stack_backend ON remote_state_locks(stack, backend_type, backend_key)"
    )

    execute(
      "CREATE INDEX IF NOT EXISTS idx_remote_state_locks_expires ON remote_state_locks(expires_at)"
    )

    # --------------------------------------- V25: AI gateway base tables
    execute("""
    CREATE TABLE IF NOT EXISTS org_ai_providers (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        provider_name TEXT NOT NULL,
        api_key_encrypted TEXT NOT NULL,
        base_url TEXT NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_org_ai_providers_org_name UNIQUE (org_id, provider_name)
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS org_ai_routes (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        alias_name TEXT NOT NULL,
        primary_model TEXT NOT NULL,
        fallback_models JSONB NOT NULL DEFAULT '[]'::jsonb,
        rtk_compression_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        caveman_mode BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_org_ai_routes_org_alias UNIQUE (org_id, alias_name)
    )
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS org_ai_usage (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        user_id TEXT,
        provider_used TEXT NOT NULL,
        model_used TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        tokens_saved_rtk INTEGER NOT NULL DEFAULT 0,
        fallback_triggered BOOLEAN NOT NULL DEFAULT FALSE,
        timestamp DOUBLE PRECISION NOT NULL
    )
    """)

    execute(
      "CREATE INDEX IF NOT EXISTS idx_org_ai_usage_org_timestamp ON org_ai_usage(org_id, timestamp DESC)"
    )

    # -------------------------------------------- V6: projects org index
    execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_org_id ON projects(org_id, id)"
    )

    execute(
      "ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_org"
    )

    execute("""
    ALTER TABLE projects ADD CONSTRAINT fk_projects_org
        FOREIGN KEY (org_id) REFERENCES orgs(id)
    """)

    # Mark the historical Python schema versions as applied so tooling that
    # inspects `schema_migrations` sees a consistent state.
    for version <- @historical_versions do
      execute(
        "INSERT INTO schema_migrations (version, applied_at) " <>
          "VALUES (#{version}, #{System.system_time(:second)}) ON CONFLICT DO NOTHING"
      )
    end
  end

  def down do
    # Intentionally irreversible: the baseline is shared with the historical
    # Python schema and the deployments that already run on it.
  end
end
