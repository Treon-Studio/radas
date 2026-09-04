"""PostgreSQL schema + versioned migrations (Fase 7).

`migrate()` applies pending versions in order (tracked in
`schema_migrations`). Version 1 creates every table the server needs:
auth/RBAC, config/projects, worker index, kv_store (JSON-config services),
executions/logs, stack-scoped data (meta/secrets/state/snapshots), and the
org tables for multi-tenancy (Fase D).

This module is the single canonical schema authority. Numbered SQL files in
`storage/migrations/` are only applied when registered in
`SQL_MIGRATION_SOURCES`; unregistered files are unreachable dead DDL and
`migrate()` refuses to run so the schema cannot drift silently.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Mapping, Tuple

from psycopg.types.json import Jsonb

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
        disabled_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS onboarding_status (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        completed_at DOUBLE PRECISION,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL
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

# Version 3 — immutable, tenant-scoped service catalog definitions.
# Catalog seed is intentionally not part of migration execution. Call
# service_catalog.seed_recommended_definitions() explicitly from an admin or
# migration command after this schema version is applied.
_V3_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS service_definitions (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        scope_type TEXT NOT NULL CHECK (scope_type IN ('platform', 'organization')),
        org_id TEXT,
        owner_id TEXT,
        current_version TEXT NOT NULL,
        disabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DOUBLE PRECISION NOT NULL,
        CHECK ((scope_type = 'platform' AND org_id IS NULL) OR
               (scope_type = 'organization' AND org_id IS NOT NULL))
    )""",
    """CREATE TABLE IF NOT EXISTS service_definition_versions (
        definition_id TEXT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
        version TEXT NOT NULL,
        manifest JSONB NOT NULL,
        published_by TEXT,
        published_at DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (definition_id, version)
    )""",
    """CREATE INDEX IF NOT EXISTS idx_service_definitions_scope
       ON service_definitions(scope_type, org_id, slug)""",
]

# Version 4 — reconcile legacy NULL-org platform duplicates before adding the
# partial unique indexes that make both scope rules explicit.
_V4_DDL: List[str] = [
    # Remove the legacy nullable unique constraint after duplicate rows have
    # been reconciled. Its platform half was never truly unique in PostgreSQL.
    "ALTER TABLE service_definitions DROP CONSTRAINT IF EXISTS service_definitions_slug_scope_type_org_id_key",
    """CREATE UNIQUE INDEX IF NOT EXISTS uq_service_definitions_platform_slug
       ON service_definitions(slug) WHERE scope_type = 'platform'""",
    """CREATE UNIQUE INDEX IF NOT EXISTS uq_service_definitions_org_slug
       ON service_definitions(org_id, slug) WHERE scope_type = 'organization'""",
]

# Version 5 — project-scoped service instances, immutable desired revisions,
# and idempotent asynchronous service operations.  The fingerprint is kept on
# the operation row so retries can be compared without persisting a raw
# request payload (which could contain a secret).
_V5_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS service_instances (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        definition_slug TEXT NOT NULL,
        definition_version TEXT NOT NULL,
        environment TEXT NOT NULL,
        runtime_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN (
            'draft', 'provisioning', 'running', 'degraded', 'stopped',
            'updating', 'destroying', 'destroyed', 'failed'
        )),
        desired_revision_id TEXT,
        provider_ref JSONB,
        endpoint_summary JSONB,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        created_by TEXT,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_service_instances_project_environment_name
            UNIQUE (project_id, environment, name)
    )""",
    """CREATE TABLE IF NOT EXISTS service_revisions (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL REFERENCES service_instances(id) ON DELETE CASCADE,
        revision_number INTEGER NOT NULL CHECK (revision_number > 0),
        spec JSONB NOT NULL,
        redacted_spec JSONB NOT NULL,
        created_by TEXT,
        created_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_service_revisions_instance_number
            UNIQUE (instance_id, revision_number)
    )""",
    """CREATE TABLE IF NOT EXISTS service_operations (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        instance_id TEXT REFERENCES service_instances(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        payload_fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN (
            'pending', 'queued', 'running', 'succeeded', 'failed', 'canceled'
        )),
        requested_by TEXT,
        error_code TEXT,
        error_message TEXT,
        started_at DOUBLE PRECISION,
        finished_at DOUBLE PRECISION,
        created_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_service_operations_project_idempotency
            UNIQUE (project_id, idempotency_key)
    )""",
    """CREATE INDEX IF NOT EXISTS idx_service_instances_project_environment_status
       ON service_instances(project_id, environment, status)""",
    """CREATE INDEX IF NOT EXISTS idx_service_revisions_instance_created
       ON service_revisions(instance_id, created_at)""",
    """CREATE INDEX IF NOT EXISTS idx_service_operations_polling
       ON service_operations(project_id, status, created_at)""",
    """CREATE INDEX IF NOT EXISTS idx_service_operations_instance_created
       ON service_operations(instance_id, created_at)""",
]

# Version 6 — tenant integrity and immutable service revision history.
_V6_DDL: List[str] = [
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_org_id ON projects(org_id, id)",
    "ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_org",
    "ALTER TABLE projects ADD CONSTRAINT fk_projects_org FOREIGN KEY (org_id) REFERENCES orgs(id)",
    "ALTER TABLE service_instances DROP CONSTRAINT IF EXISTS fk_service_instances_project",
    "ALTER TABLE service_instances ADD CONSTRAINT fk_service_instances_project FOREIGN KEY (project_id) REFERENCES projects(id)",
    "ALTER TABLE service_instances DROP CONSTRAINT IF EXISTS fk_service_instances_org_project",
    "ALTER TABLE service_instances ADD CONSTRAINT fk_service_instances_org_project FOREIGN KEY (org_id, project_id) REFERENCES projects(org_id, id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_service_revisions_instance_id ON service_revisions(instance_id, id)",
    "ALTER TABLE service_instances DROP CONSTRAINT IF EXISTS fk_service_instances_desired_revision",
    "ALTER TABLE service_instances ADD CONSTRAINT fk_service_instances_desired_revision FOREIGN KEY (id, desired_revision_id) REFERENCES service_revisions(instance_id, id) DEFERRABLE INITIALLY DEFERRED",
    "ALTER TABLE service_operations DROP CONSTRAINT IF EXISTS fk_service_operations_project",
    "ALTER TABLE service_operations ADD CONSTRAINT fk_service_operations_project FOREIGN KEY (project_id) REFERENCES projects(id)",
    "ALTER TABLE service_operations DROP CONSTRAINT IF EXISTS fk_service_operations_org_project",
    "ALTER TABLE service_operations ADD CONSTRAINT fk_service_operations_org_project FOREIGN KEY (org_id, project_id) REFERENCES projects(org_id, id)",
    "ALTER TABLE service_operations DROP CONSTRAINT IF EXISTS service_operations_instance_id_fkey",
    "ALTER TABLE service_operations DROP CONSTRAINT IF EXISTS fk_service_operations_instance",
    "ALTER TABLE service_operations ADD CONSTRAINT fk_service_operations_instance FOREIGN KEY (instance_id) REFERENCES service_instances(id)",
    "ALTER TABLE service_revisions DROP CONSTRAINT IF EXISTS service_revisions_instance_id_fkey",
    "ALTER TABLE service_revisions DROP CONSTRAINT IF EXISTS fk_service_revisions_instance",
    "ALTER TABLE service_revisions ADD CONSTRAINT fk_service_revisions_instance FOREIGN KEY (instance_id) REFERENCES service_instances(id)",
    """CREATE OR REPLACE FUNCTION reject_service_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'service revision history is immutable'; END; $$""",
    """DROP TRIGGER IF EXISTS service_revisions_immutable ON service_revisions""",
    """CREATE TRIGGER service_revisions_immutable BEFORE UPDATE OR DELETE ON service_revisions
       FOR EACH ROW EXECUTE FUNCTION reject_service_revision_mutation()""",
    """CREATE OR REPLACE FUNCTION check_service_revision_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM service_instances i WHERE i.id = NEW.instance_id) THEN
        RAISE EXCEPTION 'service revision instance is invalid';
      END IF;
      RETURN NEW;
    END; $$""",
]


# Version 7 — composite tenant integrity for operation-to-instance links.
# ``instance_id`` remains nullable for project-level operations, but whenever it
# is present the database requires the same org/project tuple as the instance.
_V7_DDL: List[str] = [
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_service_instances_org_project_id ON service_instances(org_id, project_id, id)",
    "ALTER TABLE service_operations DROP CONSTRAINT IF EXISTS fk_service_operations_instance_tenant",
    "ALTER TABLE service_operations ADD CONSTRAINT fk_service_operations_instance_tenant "
    "FOREIGN KEY (org_id, project_id, instance_id) REFERENCES service_instances(org_id, project_id, id)",
]

# Version 8 — worker lease metadata, redacted service-operation payloads, and
# append-only progress events. These fields extend the existing worker protocol;
# they are not a second queue.
_V8_DDL: List[str] = [
    "ALTER TABLE service_operations ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb",
    "ALTER TABLE service_operations ADD COLUMN IF NOT EXISTS worker_id TEXT",
    "ALTER TABLE service_operations ADD COLUMN IF NOT EXISTS heartbeat_at DOUBLE PRECISION",
    "ALTER TABLE service_operations ADD COLUMN IF NOT EXISTS lease_until DOUBLE PRECISION",
    "ALTER TABLE service_operations ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE service_operations ADD COLUMN IF NOT EXISTS lease_token TEXT",
    "ALTER TABLE service_operations ADD COLUMN IF NOT EXISTS provider_result JSONB",
    "CREATE INDEX IF NOT EXISTS idx_service_operations_claim ON service_operations(status, lease_until, created_at)",
    "CREATE TABLE IF NOT EXISTS service_operation_events ("
    "id BIGSERIAL PRIMARY KEY, operation_id TEXT NOT NULL REFERENCES service_operations(id) ON DELETE CASCADE, "
    "event TEXT NOT NULL, message TEXT, details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at DOUBLE PRECISION NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_service_operation_events_operation ON service_operation_events(operation_id, created_at)",
]

# Version 9 — database-enforced exactly-once lifecycle events. Progress events
# remain append-only (multiple provider_step/health_check/reclaimed rows are
# meaningful), while queued and terminal events each have one canonical row.
_V9_DDL: List[str] = [
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_service_operation_events_queued_once "
    "ON service_operation_events(operation_id) WHERE event = 'queued'",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_service_operation_events_terminal_once "
    "ON service_operation_events(operation_id) "
    "WHERE event IN ('succeeded', 'failed', 'canceled')",
]

# Version 10 — idempotent immutable desired-revision writes. The request key
# is scoped to the service instance and stores only a safe spec fingerprint.
_V10_DDL: List[str] = [
    "CREATE TABLE IF NOT EXISTS service_revision_idempotency ("
    "instance_id TEXT NOT NULL REFERENCES service_instances(id) ON DELETE CASCADE, "
    "idempotency_key TEXT NOT NULL, payload_fingerprint TEXT NOT NULL, "
    "revision_id TEXT NOT NULL REFERENCES service_revisions(id), "
    "created_at DOUBLE PRECISION NOT NULL, "
    "PRIMARY KEY (instance_id, idempotency_key))",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_service_revision_idempotency_revision "
    "ON service_revision_idempotency(revision_id)",
]

# Version 11 — composite revision ownership for idempotency rows. Existing
# rows are checked before the constraint is installed; invalid legacy data
# aborts migration instead of being silently reassigned.
_V11_DDL: List[str] = [
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_service_revisions_instance_id_id "
    "ON service_revisions(instance_id, id)",
    "ALTER TABLE service_revision_idempotency "
    "DROP CONSTRAINT IF EXISTS fk_service_revision_idempotency_revision_instance",
    "ALTER TABLE service_revision_idempotency "
    "ADD CONSTRAINT fk_service_revision_idempotency_revision_instance "
    "FOREIGN KEY (instance_id, revision_id) REFERENCES service_revisions(instance_id, id)",
]

# Version 12 — canonical project environments and protected metadata.
_V12_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS project_environments (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        protected BOOLEAN NOT NULL DEFAULT FALSE,
        variables JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_project_environments_project_name UNIQUE (project_id, name),
        CONSTRAINT fk_project_environments_project FOREIGN KEY (org_id, project_id)
            REFERENCES projects(org_id, id) ON DELETE CASCADE
    )""",
    """CREATE INDEX IF NOT EXISTS idx_project_environments_project
       ON project_environments(project_id, name)""",
]

# Version 13 — service-specific Git source bindings and immutable commit metadata.
_V13_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS service_sources (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        instance_id TEXT NOT NULL UNIQUE REFERENCES service_instances(id) ON DELETE CASCADE,
        repo_url TEXT NOT NULL,
        ref TEXT NOT NULL,
        path TEXT NOT NULL DEFAULT '',
        commit_sha TEXT,
        source_revision TEXT,
        auth_secret_id TEXT,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT fk_service_sources_project FOREIGN KEY (org_id, project_id)
            REFERENCES projects(org_id, id) ON DELETE CASCADE
    )""",
    """CREATE INDEX IF NOT EXISTS idx_service_sources_project
       ON service_sources(project_id, updated_at)""",
]

# Version 14 — service-scoped pipeline definitions and runs.
_V14_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS service_pipelines (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        instance_id TEXT NOT NULL UNIQUE REFERENCES service_instances(id) ON DELETE CASCADE,
        stages JSONB NOT NULL,
        source_revision TEXT,
        created_by TEXT,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT fk_service_pipelines_project FOREIGN KEY (org_id, project_id)
            REFERENCES projects(org_id, id) ON DELETE CASCADE
    )""",
    """CREATE TABLE IF NOT EXISTS service_pipeline_runs (
        id TEXT PRIMARY KEY,
        pipeline_id TEXT NOT NULL REFERENCES service_pipelines(id) ON DELETE CASCADE,
        org_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        instance_id TEXT NOT NULL REFERENCES service_instances(id) ON DELETE CASCADE,
        operation_id TEXT,
        source_revision TEXT NOT NULL,
        target_environment TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued','running','awaiting_approval','succeeded','failed','canceled')),
        stages JSONB NOT NULL,
        approved_by TEXT,
        error_message TEXT,
        created_by TEXT,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT fk_service_pipeline_runs_project FOREIGN KEY (org_id, project_id)
            REFERENCES projects(org_id, id) ON DELETE CASCADE
    )""",
    """CREATE INDEX IF NOT EXISTS idx_service_pipeline_runs_instance
       ON service_pipeline_runs(instance_id, created_at)""",
]

# Version 15 — service health observations for bounded operational history.
_V15_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS service_health_observations (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        instance_id TEXT NOT NULL REFERENCES service_instances(id) ON DELETE CASCADE,
        check_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('healthy','degraded','unhealthy','unknown')),
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        endpoint JSONB,
        observed_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT fk_service_health_project FOREIGN KEY (org_id, project_id)
            REFERENCES projects(org_id, id) ON DELETE CASCADE
    )""",
    """CREATE INDEX IF NOT EXISTS idx_service_health_instance_observed
       ON service_health_observations(instance_id, observed_at DESC)""",
]

# Version 16 — normalized service usage snapshots for governance/export.
_V16_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS service_usage_snapshots (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        instance_id TEXT NOT NULL REFERENCES service_instances(id) ON DELETE CASCADE,
        runtime_id TEXT NOT NULL,
        cpu_millicores INTEGER NOT NULL DEFAULT 0,
        memory_mb INTEGER NOT NULL DEFAULT 0,
        storage_gb INTEGER NOT NULL DEFAULT 0,
        running_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
        provider_cost JSONB NOT NULL DEFAULT '{}'::jsonb,
        observed_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT fk_service_usage_project FOREIGN KEY (org_id, project_id)
            REFERENCES projects(org_id, id) ON DELETE CASCADE
    )""",
    """CREATE INDEX IF NOT EXISTS idx_service_usage_project_observed
       ON service_usage_snapshots(project_id, observed_at DESC)""",
    """CREATE INDEX IF NOT EXISTS idx_service_usage_org_observed
       ON service_usage_snapshots(org_id, observed_at DESC)""",
]

# Version 17 — organization-scoped runtime/provider connections.
_V17_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS runtime_connections (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        name TEXT NOT NULL,
        runtime_id TEXT NOT NULL,
        secret_id TEXT,
        capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
        configured BOOLEAN NOT NULL DEFAULT TRUE,
        healthy BOOLEAN NOT NULL DEFAULT FALSE,
        last_tested_at DOUBLE PRECISION,
        last_error TEXT,
        rotated_at DOUBLE PRECISION,
        created_by TEXT,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_runtime_connections_org_name UNIQUE (org_id, name),
        CONSTRAINT fk_runtime_connections_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
    )""",
    """CREATE INDEX IF NOT EXISTS idx_runtime_connections_org_runtime
       ON runtime_connections(org_id, runtime_id)""",
]

# Version 18 — reviewable service change requests and append-only decisions.
_V18_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS service_change_requests (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        instance_id TEXT NOT NULL REFERENCES service_instances(id) ON DELETE CASCADE,
        revision_id TEXT NOT NULL,
        source_revision TEXT,
        fingerprint TEXT NOT NULL,
        before_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
        after_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
        diff JSONB NOT NULL DEFAULT '{}'::jsonb,
        risk JSONB NOT NULL DEFAULT '{}'::jsonb,
        policy_results JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL CHECK (status IN ('open','approved','rejected','canceled','deployed')),
        requested_by TEXT,
        approved_by TEXT,
        deployed_by TEXT,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        UNIQUE (project_id, instance_id, fingerprint),
        CONSTRAINT fk_change_request_project FOREIGN KEY (org_id, project_id)
            REFERENCES projects(org_id, id) ON DELETE CASCADE
    )""",
    """CREATE TABLE IF NOT EXISTS service_change_decisions (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL REFERENCES service_change_requests(id) ON DELETE CASCADE,
        decision TEXT NOT NULL CHECK (decision IN ('approved','rejected','canceled')),
        actor_id TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at DOUBLE PRECISION NOT NULL
    )""",
    """CREATE INDEX IF NOT EXISTS idx_change_requests_instance
       ON service_change_requests(instance_id, created_at DESC)""",
]

# Version 19 — catalog deprecation and security review metadata.
_V19_DDL: List[str] = [
    "ALTER TABLE service_definitions ADD COLUMN IF NOT EXISTS deprecation_reason TEXT",
    "ALTER TABLE service_definitions ADD COLUMN IF NOT EXISTS deprecated_at DOUBLE PRECISION",
    "ALTER TABLE service_definitions ADD COLUMN IF NOT EXISTS security_review JSONB NOT NULL DEFAULT '{}'::jsonb",
    "CREATE INDEX IF NOT EXISTS idx_service_definitions_deprecated ON service_definitions(disabled, deprecated_at)",
]

# Version 20 — billing-ready organization plan/quota boundary.
_V20_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS org_billing_plans (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL UNIQUE REFERENCES orgs(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL,
        limits JSONB NOT NULL DEFAULT '{}'::jsonb,
        state TEXT NOT NULL CHECK (state IN ('active','grace','suspended')),
        grace_until DOUBLE PRECISION,
        assigned_by TEXT,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_org_billing_plans_state ON org_billing_plans(state)",
]

# Version 21 — organization-private OpenTofu module registry.
_V21_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS tofu_modules (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        scope_type TEXT NOT NULL CHECK (scope_type = 'organization'),
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        owner_id TEXT,
        current_version TEXT NOT NULL,
        disabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DOUBLE PRECISION NOT NULL,
        UNIQUE (org_id, slug)
    )""",
    """CREATE TABLE IF NOT EXISTS tofu_module_versions (
        definition_id TEXT NOT NULL REFERENCES tofu_modules(id) ON DELETE CASCADE,
        version TEXT NOT NULL,
        manifest JSONB NOT NULL,
        archive_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        size BIGINT NOT NULL,
        file_count INTEGER NOT NULL,
        published_by TEXT,
        published_at DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (definition_id, version)
    )""",
    """CREATE INDEX IF NOT EXISTS idx_tofu_modules_org_slug ON tofu_modules(org_id, slug)""",
]

# Version 22 — project admission leases.
_V22_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS project_admission_leases (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL, reference_id TEXT NOT NULL, worker_id TEXT, status TEXT NOT NULL, lease_until DOUBLE PRECISION, created_at DOUBLE PRECISION NOT NULL, updated_at DOUBLE PRECISION NOT NULL, UNIQUE(kind, reference_id))""",
    """CREATE INDEX IF NOT EXISTS project_admission_leases_project_active_idx ON project_admission_leases(project_id, status, lease_until)""",
]

_V23_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS project_locks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        actor TEXT,
        operation TEXT NOT NULL,
        run_id TEXT,
        acquired_at REAL NOT NULL,
        expires_at REAL NOT NULL
    )""",
    """CREATE INDEX IF NOT EXISTS idx_project_locks_project_expires ON project_locks(project_id, expires_at)""",
]

_V24_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS remote_state_locks (
        id TEXT PRIMARY KEY,
        stack TEXT NOT NULL,
        backend_type TEXT NOT NULL,
        backend_key TEXT NOT NULL,
        actor TEXT,
        operation TEXT NOT NULL,
        run_id TEXT,
        acquired_at REAL NOT NULL,
        expires_at REAL NOT NULL
    )""",
    """CREATE INDEX IF NOT EXISTS idx_remote_state_locks_stack_backend ON remote_state_locks(stack, backend_type, backend_key)""",
    """CREATE INDEX IF NOT EXISTS idx_remote_state_locks_expires ON remote_state_locks(expires_at)""",
]

# Version 25 — 9Router multi-tenant per-organization AI Gateway & fallback rules.
_V25_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS org_ai_providers (
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
    )""",
    """CREATE TABLE IF NOT EXISTS org_ai_routes (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        alias_name TEXT NOT NULL,
        primary_model TEXT NOT NULL,
        fallback_models JSONB NOT NULL DEFAULT '[]'::jsonb,
        rtk_compression_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        caveman_mode BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_org_ai_routes_org_alias UNIQUE (org_id, alias_name)
    )""",
    """CREATE TABLE IF NOT EXISTS org_ai_usage (
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
    )""",
    """CREATE INDEX IF NOT EXISTS idx_org_ai_usage_org_timestamp ON org_ai_usage(org_id, timestamp DESC)""",
]

# Version 26 — 9Router multi-account credentials and gateway endpoint keys.
_V26_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS org_ai_provider_accounts (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        provider_name TEXT NOT NULL,
        label TEXT NOT NULL,
        api_key_encrypted TEXT NOT NULL,
        base_url TEXT NOT NULL DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 100,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_org_ai_accounts UNIQUE (org_id, provider_name, label)
    )""",
    """CREATE INDEX IF NOT EXISTS idx_org_ai_accounts_lookup ON org_ai_provider_accounts(org_id, provider_name, is_active, priority)""",
    """CREATE TABLE IF NOT EXISTS org_ai_endpoint_keys (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DOUBLE PRECISION NOT NULL,
        last_used_at DOUBLE PRECISION,
        CONSTRAINT uq_org_ai_endpoint_keys_prefix UNIQUE (org_id, key_prefix)
    )""",
    """CREATE INDEX IF NOT EXISTS idx_org_ai_endpoint_keys_org ON org_ai_endpoint_keys(org_id, is_active)""",
]

# Version 27 — 9Router request/attempt telemetry with per-model cost estimates.
_V27_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS org_ai_request_logs (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        user_id TEXT,
        endpoint TEXT NOT NULL,
        requested_model TEXT NOT NULL,
        resolved_provider TEXT,
        resolved_model TEXT,
        status TEXT NOT NULL,
        error_code TEXT,
        http_status INTEGER,
        latency_ms INTEGER,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        tokens_saved_rtk INTEGER NOT NULL DEFAULT 0,
        cost_usd_est DOUBLE PRECISION NOT NULL DEFAULT 0,
        fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
        stream BOOLEAN NOT NULL DEFAULT FALSE,
        request_id TEXT NOT NULL,
        attempts JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at DOUBLE PRECISION NOT NULL
    )""",
    """CREATE INDEX IF NOT EXISTS idx_org_ai_request_logs_org_time ON org_ai_request_logs(org_id, created_at DESC)""",
    """CREATE INDEX IF NOT EXISTS idx_org_ai_request_logs_request ON org_ai_request_logs(request_id)""",
]

# Version 28 — 9Router OAuth provider accounts (PKCE flows, encrypted tokens).
_V28_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS org_ai_oauth_accounts (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        provider_name TEXT NOT NULL,
        label TEXT NOT NULL,
        client_id TEXT NOT NULL DEFAULT '',
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT,
        scope TEXT,
        status TEXT NOT NULL DEFAULT 'connected',
        expires_at DOUBLE PRECISION,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_org_ai_oauth_accounts UNIQUE (org_id, provider_name, label)
    )""",
    """CREATE INDEX IF NOT EXISTS idx_org_ai_oauth_accounts_lookup ON org_ai_oauth_accounts(org_id, provider_name, status)""",
]

# Version 29 - 9Router org egress proxy pools (encrypted proxy URLs, rotation).
_V29_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS org_ai_proxy_pools (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        proxy_url_encrypted TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DOUBLE PRECISION NOT NULL,
        updated_at DOUBLE PRECISION NOT NULL,
        CONSTRAINT uq_org_ai_proxy_pools UNIQUE (org_id, label)
    )""",
    """CREATE INDEX IF NOT EXISTS idx_org_ai_proxy_pools_lookup ON org_ai_proxy_pools(org_id, is_active)""",
]

# Version 30 - 9Router stateful Responses storage (store=true / previous_response_id).
_V30_DDL: List[str] = [
    """CREATE TABLE IF NOT EXISTS org_ai_responses (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
        user_id TEXT,
        provider_name TEXT,
        model TEXT,
        input_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
        output_json JSONB,
        output_text TEXT,
        previous_response_id TEXT,
        created_at DOUBLE PRECISION NOT NULL
    )""",
    """CREATE INDEX IF NOT EXISTS idx_org_ai_responses_org_time ON org_ai_responses(org_id, created_at DESC)""",
]

# Ordered source of truth for the schema's applied versions. Tests and tooling
# use this registry instead of duplicating a stale list of migration numbers.
MIGRATIONS = (
    (1, _V1_DDL), (2, _V2_DDL), (3, _V3_DDL), (4, _V4_DDL), (5, _V5_DDL),
    (6, _V6_DDL), (7, _V7_DDL), (8, _V8_DDL), (9, _V9_DDL), (10, _V10_DDL),
    (11, _V11_DDL), (12, _V12_DDL), (13, _V13_DDL), (14, _V14_DDL),
    (15, _V15_DDL), (16, _V16_DDL), (17, _V17_DDL), (18, _V18_DDL),
    (19, _V19_DDL), (20, _V20_DDL), (21, _V21_DDL), (22, _V22_DDL),
    (23, _V23_DDL), (24, _V24_DDL), (25, _V25_DDL), (26, _V26_DDL),
    (27, _V27_DDL), (28, _V28_DDL), (29, _V29_DDL), (30, _V30_DDL),
)

# Directory scanned by the reproducibility gate for numbered SQL migration
# files (``NNN_name.sql``).
MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"

# Numbered SQL files applied by the canonical runner, mapped to the schema
# version whose DDL the file provides. A numbered SQL file inside
# ``MIGRATIONS_DIR`` that is not listed here is unreachable dead DDL; the
# reproducibility test fails and ``migrate()`` refuses to run so the schema
# cannot drift silently.
SQL_MIGRATION_SOURCES: Dict[str, int] = {}

_NUMBERED_SQL_FILE = re.compile(r"\d+_.+\.sql\Z")


def numbered_sql_files(directory: Any = None) -> List[str]:
    """List numbered SQL migration files found in ``directory``."""
    dir_path = Path(directory) if directory is not None else MIGRATIONS_DIR
    if not dir_path.is_dir():
        return []
    return sorted(
        entry.name for entry in dir_path.iterdir()
        if entry.is_file() and _NUMBERED_SQL_FILE.fullmatch(entry.name)
    )


def unreachable_sql_migrations(directory: Any = None) -> List[str]:
    """Numbered SQL files that the canonical migration runner never applies."""
    return [
        name for name in numbered_sql_files(directory)
        if name not in SQL_MIGRATION_SOURCES
    ]


def load_sql_migration(filename: str, directory: Any = None) -> List[str]:
    """Split a numbered SQL file into executable statements.

    Comment-only fragments (file headers, trailing comments) are dropped;
    statement bodies may still carry inline ``--`` comments, which PostgreSQL
    accepts.
    """
    dir_path = Path(directory) if directory is not None else MIGRATIONS_DIR
    text = (dir_path / filename).read_text()
    statements: List[str] = []
    for fragment in text.split(";"):
        has_code = any(
            line.strip() and not line.strip().startswith("--")
            for line in fragment.splitlines()
        )
        if has_code:
            statements.append(fragment.strip())
    return statements


def _migration_plan() -> List[Tuple[int, List[str]]]:
    """Canonical, ordered migration sequence including file-backed versions."""
    plan: Dict[int, List[str]] = {version: list(ddl) for version, ddl in MIGRATIONS}
    for filename, version in SQL_MIGRATION_SOURCES.items():
        if version in plan:
            raise RuntimeError(
                f"schema authority conflict: {filename} duplicates the inline DDL "
                f"already registered for schema version {version}; the canonical "
                "definition must exist exactly once"
            )
        plan[version] = load_sql_migration(filename)
    return sorted(plan.items())


def schema_snapshot(conn: Any) -> Dict[str, List[str]]:
    """Return a reproducible fingerprint of the public schema.

    Keys: ``tables`` (sorted names), ``columns`` (``table.column:type`` in
    declaration order), ``indexes`` (``name::indexdef``), and
    ``migration_versions`` (applied schema versions, ascending). Used by the
    reproducibility gate to prove that ``migrate()`` is idempotent and that
    fresh and upgrade paths converge.
    """
    def _cell(row: Any, key: str) -> Any:
        return row[key] if isinstance(row, Mapping) else row[0]

    tables = conn.execute(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    ).fetchall()
    columns = conn.execute(
        "SELECT table_name, column_name, data_type FROM information_schema.columns "
        "WHERE table_schema = 'public' ORDER BY table_name, ordinal_position"
    ).fetchall()
    indexes = conn.execute(
        "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' "
        "ORDER BY indexname"
    ).fetchall()
    versions = conn.execute(
        "SELECT version FROM schema_migrations ORDER BY version"
    ).fetchall()
    return {
        "tables": [str(_cell(row, "tablename")) for row in tables],
        "columns": [
            f"{_cell(row, 'table_name')}.{_cell(row, 'column_name')}:"
            f"{_cell(row, 'data_type')}"
            for row in columns
        ],
        "indexes": [
            f"{_cell(row, 'indexname')}::{_cell(row, 'indexdef')}" for row in indexes
        ],
        "migration_versions": [str(_cell(row, "version")) for row in versions],
    }


class CatalogMigrationError(RuntimeError):
    """Raised when legacy catalog rows cannot be merged without data loss."""


class EventMigrationError(RuntimeError):
    """Raised when lifecycle event duplicates are not safely reconcilable."""


class RevisionIdempotencyMigrationError(RuntimeError):
    """Raised when legacy revision idempotency ownership is corrupt."""


def _validate_revision_idempotency_ownership(conn: Any) -> None:
    invalid = conn.execute(
        "SELECT k.instance_id, k.revision_id FROM service_revision_idempotency k "
        "LEFT JOIN service_revisions r ON r.instance_id = k.instance_id AND r.id = k.revision_id "
        "WHERE r.id IS NULL LIMIT 1"
    ).fetchone()
    if invalid:
        raise RevisionIdempotencyMigrationError(
            "schema migration v11 found revision idempotency row whose revision belongs to another instance"
        )


def _reconcile_service_operation_event_duplicates(conn: Any) -> None:
    """Collapse legacy lifecycle duplicates before creating unique indexes.

    Duplicate queued rows are equivalent. Terminal rows are equivalent only
    when their event is the same; conflicting terminal outcomes are retained
    as an actionable migration failure instead of silently choosing a result.
    The lowest event id is the deterministic canonical row.
    """
    groups = conn.execute(
        "SELECT operation_id, event, COUNT(*) AS count FROM service_operation_events "
        "WHERE event = 'queued' GROUP BY operation_id, event HAVING COUNT(*) > 1 "
        "UNION ALL SELECT operation_id, 'terminal', COUNT(*) FROM service_operation_events "
        "WHERE event IN ('succeeded', 'failed', 'canceled') GROUP BY operation_id "
        "HAVING COUNT(*) > 1"
    ).fetchall()
    for group in groups:
        operation_id = group["operation_id"]
        event_group = group["event"]
        if event_group == "terminal":
            rows = conn.execute(
                "SELECT id, event FROM service_operation_events "
                "WHERE operation_id = %s AND event IN ('succeeded', 'failed', 'canceled') "
                "ORDER BY id FOR UPDATE",
                (operation_id,),
            ).fetchall()
            event_names = {row["event"] for row in rows}
            if len(event_names) > 1:
                raise EventMigrationError(
                    "schema migration v9 found conflicting terminal events for operation "
                    f"{operation_id!r}: {sorted(event_names)!r}; resolve service_operation_events "
                    "manually and retry migration"
                )
        else:
            rows = conn.execute(
                "SELECT id, event FROM service_operation_events "
                "WHERE operation_id = %s AND event = 'queued' ORDER BY id FOR UPDATE",
                (operation_id,),
            ).fetchall()
        for duplicate in rows[1:]:
            conn.execute("DELETE FROM service_operation_events WHERE id = %s", (duplicate["id"],))


def _migration_semver_key(version: str) -> tuple[Any, ...]:
    match = re.fullmatch(
        r"(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?",
        str(version),
    )
    if not match:
        raise CatalogMigrationError(
            f"catalog migration v4 cannot reconcile invalid version {version!r}; "
            "repair service_definition_versions before retrying"
        )
    prerelease = match.group(4)
    identifiers = () if prerelease is None else tuple(
        (0, int(part)) if part.isdigit() else (1, part)
        for part in prerelease.split(".")
    )
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)), prerelease is None, identifiers)


def _reconcile_platform_duplicates(conn: Any) -> None:
    """Merge legacy NULL-org platform duplicates before adding the unique index.

    Old v3 databases used ``UNIQUE (slug, scope_type, org_id)``; PostgreSQL
    considers NULLs distinct, so more than one platform row could exist. The
    row with the highest current semantic version wins, with created time and
    id as deterministic tie breakers. Every version and audit row is retained.
    Security-relevant definition state is merged before the duplicate rows are
    removed: disabled is an OR across all duplicates, and a single non-null
    owner is retained. Distinct non-null owners are incompatible and abort the
    migration rather than silently discarding ownership metadata.
    """
    duplicate_slugs = conn.execute(
        "SELECT slug FROM service_definitions WHERE scope_type = 'platform' "
        "GROUP BY slug HAVING COUNT(*) > 1 ORDER BY slug"
    ).fetchall()
    for duplicate in duplicate_slugs:
        slug = duplicate["slug"]
        rows = conn.execute(
            "SELECT id, slug, scope_type, org_id, owner_id, current_version, "
            "disabled, created_at FROM service_definitions "
            "WHERE scope_type = 'platform' AND slug = %s "
            "ORDER BY id FOR UPDATE",
            (slug,),
        ).fetchall()
        try:
            owner_ids = {row["owner_id"] for row in rows if row["owner_id"] is not None}
            if len(owner_ids) > 1:
                raise CatalogMigrationError(
                    f"catalog migration v4 found conflicting owners for platform slug "
                    f"{slug!r}; resolve the duplicate rows manually and retry"
                )
            owner_id = next(iter(owner_ids), None)
            disabled = any(bool(row["disabled"]) for row in rows)
            winner = max(
                rows,
                key=lambda row: (
                    _migration_semver_key(row["current_version"]),
                    row["created_at"],
                    str(row["id"]),
                ),
            )
        except CatalogMigrationError:
            raise
        except (KeyError, TypeError) as exc:
            raise CatalogMigrationError(
                f"catalog migration v4 cannot reconcile platform slug {slug!r}; "
                "definition metadata is incomplete"
            ) from exc
        winner_id = winner["id"]

        version_rows = conn.execute(
            "SELECT definition_id, version, manifest, published_by, published_at "
            "FROM service_definition_versions WHERE definition_id = ANY(%s) "
            "ORDER BY definition_id, version FOR UPDATE",
            ([row["id"] for row in rows],),
        ).fetchall()
        by_version: dict[str, Mapping[str, Any]] = {}
        versions_by_definition = {row["id"]: set() for row in rows}
        for version_row in version_rows:
            version = str(version_row["version"])
            _migration_semver_key(version)
            versions_by_definition[version_row["definition_id"]].add(version)
            existing = by_version.get(version)
            if existing is not None:
                if json.dumps(existing["manifest"], sort_keys=True, default=str) != json.dumps(
                    version_row["manifest"], sort_keys=True, default=str
                ):
                    raise CatalogMigrationError(
                        f"catalog migration v4 found conflicting manifests for platform slug "
                        f"{slug!r} version {version!r}; resolve the duplicate rows manually and retry"
                    )
                # Keep the most recent publication metadata for an identical
                # version while retaining every publication audit row below.
                if (
                    float(version_row["published_at"]),
                    str(version_row["published_by"] or ""),
                    str(version_row["definition_id"]),
                ) > (
                    float(existing["published_at"]),
                    str(existing["published_by"] or ""),
                    str(existing["definition_id"]),
                ):
                    by_version[version] = version_row
                continue
            by_version[version] = version_row

        for row in rows:
            if row["current_version"] not in versions_by_definition[row["id"]]:
                raise CatalogMigrationError(
                    f"catalog migration v4 cannot reconcile platform slug {slug!r}: "
                    f"definition {row['id']!r} points to missing version {row['current_version']!r}; "
                    "restore its service_definition_versions row and retry"
                )
        highest_version = max(by_version, key=_migration_semver_key) if by_version else None
        for version, version_row in by_version.items():
            if version_row["definition_id"] == winner_id:
                continue
            conn.execute(
                "INSERT INTO service_definition_versions "
                "(definition_id, version, manifest, published_by, published_at) "
                "VALUES (%s,%s,%s,%s,%s) ON CONFLICT (definition_id, version) DO NOTHING",
                (winner_id, version, Jsonb(version_row["manifest"]), version_row["published_by"], version_row["published_at"]),
            )
        if highest_version is None:
            raise CatalogMigrationError(
                f"catalog migration v4 found platform slug {slug!r} without versions; "
                "restore its service_definition_versions rows and retry"
            )
        conn.execute(
            "UPDATE service_definitions SET current_version = %s, owner_id = %s, disabled = %s "
            "WHERE id = %s",
            (highest_version, owner_id, disabled, winner_id),
        )
        for row in rows:
            if row["id"] == winner_id:
                continue
            # Keep audit history while making the surviving definition id the
            # canonical target for historical catalog publication events.
            conn.execute(
                "UPDATE audit_log SET target_id = %s "
                "WHERE target_type = 'service_definition' AND target_id = %s",
                (winner_id, row["id"]),
            )
            conn.execute("DELETE FROM service_definitions WHERE id = %s", (row["id"],))


def migrate(*, seed_catalog: bool = False) -> None:
    """Apply pending schema migrations (idempotent).

    ``seed_catalog`` is an explicit initialization choice used by the supported
    server startup path. It publishes only the pinned, provider-independent
    catalog definitions and never creates an instance or invokes a provider.
    Keeping it opt-in avoids surprising test/tools that only need schema DDL.
    """
    unreachable = unreachable_sql_migrations()
    if unreachable:
        raise RuntimeError(
            "numbered SQL migration file(s) not reachable from the canonical "
            "migration runner: " + ", ".join(unreachable) + "; register them in "
            "storage.pg_schema.SQL_MIGRATION_SOURCES or remove the files"
        )
    pg.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at REAL
        )
    """)
    import time

    applied = {r["version"] for r in pg.query_all("SELECT version FROM schema_migrations")}
    for version, ddl in _migration_plan():
        if version in applied:
            continue
        with pg.transaction() as conn:
            if version == 4:
                _reconcile_platform_duplicates(conn)
            if version == 9:
                _reconcile_service_operation_event_duplicates(conn)
            if version == 11:
                _validate_revision_idempotency_ownership(conn)
            for stmt in ddl:
                conn.execute(stmt)
            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (%s, %s)",
                (version, time.time()),
            )
        logger.info("Applied schema migration v%d", version)
    if seed_catalog:
        from services.service_catalog import seed_recommended_definitions
        seeded = seed_recommended_definitions()
        logger.info("Recommended service catalog ready (%d definitions)", len(seeded))


def reset_schema() -> None:
    """Drop all tables (test helper) then re-apply schema."""
    with pg.transaction() as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
    migrate()
