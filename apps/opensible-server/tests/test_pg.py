"""Unit tests for the Postgres access layer (Fase 7 — A1/A2).

Requires TEST_DATABASE_URL (or DATABASE_URL) pointing at a scratch database;
schema is reset per test via the pg_db fixture.
"""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/radas_test")

import pytest

from storage import pg, pg_schema


@pytest.fixture(autouse=True)
def pg_db():
    pg.reset_connection_pool()
    pg_schema.reset_schema()
    yield
    pg.reset_connection_pool()


def test_ping_ok(pg_db):
    assert pg.ping() is True


def test_execute_insert_select_roundtrip(pg_db):
    pg.execute("INSERT INTO settings (key, value_json, updated_at) VALUES (%s, %s, %s)",
               ("t1", '"v1"', "now"))
    rows = pg.query_all("SELECT * FROM settings WHERE key = %s", ("t1",))
    assert len(rows) == 1
    assert rows[0]["value_json"] == '"v1"'


def test_query_one_returns_none_when_missing(pg_db):
    assert pg.query_one("SELECT * FROM settings WHERE key = %s", ("nope",)) is None


def test_execute_returns_rows_for_select(pg_db):
    pg.execute("INSERT INTO settings (key, value_json, updated_at) VALUES (%s, %s, %s)",
               ("t2", "{}", "now"))
    rows = pg.execute("SELECT key FROM settings WHERE key = %s", ("t2",))
    assert rows[0]["key"] == "t2"


def test_transaction_rolls_back_on_error(pg_db):
    with pytest.raises(RuntimeError):
        with pg.transaction() as conn:
            conn.execute("INSERT INTO settings (key, value_json, updated_at) VALUES (%s,%s,%s)",
                         ("tx", "{}", "now"))
            raise RuntimeError("boom")
    assert pg.query_one("SELECT * FROM settings WHERE key = %s", ("tx",)) is None


def test_transaction_commits(pg_db):
    with pg.transaction() as conn:
        conn.execute("INSERT INTO settings (key, value_json, updated_at) VALUES (%s,%s,%s)",
                     ("tx2", "{}", "now"))
    assert pg.query_one("SELECT * FROM settings WHERE key = %s", ("tx2",)) is not None


def test_schema_migrate_idempotent(pg_db):
    # reset_schema applies all current migrations; calling migrate again is safe.
    pg_schema.migrate()
    versions = pg.query_all("SELECT version FROM schema_migrations ORDER BY version")
    assert versions == [
        {"version": 1}, {"version": 2}, {"version": 3}, {"version": 4}, {"version": 5}, {"version": 6}, {"version": 7},
    ]


def test_schema_v3_catalog_tables_exist(pg_db):
    assert pg.query_one("SELECT version FROM schema_migrations WHERE version = 3") == {"version": 3}
    assert pg.query_one("SELECT version FROM schema_migrations WHERE version = 4") == {"version": 4}
    for table in ("service_definitions", "service_definition_versions"):
        assert pg.query_one("SELECT to_regclass(%s) AS name", (f"public.{table}",))["name"] == table


def test_catalog_v1_v2_upgrade_applies_v3_v4(pg_db):
    pg.execute("DELETE FROM schema_migrations")
    pg.execute("DROP TABLE IF EXISTS service_definition_versions CASCADE")
    pg.execute("DROP TABLE IF EXISTS service_definitions CASCADE")
    pg.execute("CREATE TABLE service_definitions (id TEXT PRIMARY KEY, slug TEXT NOT NULL, scope_type TEXT NOT NULL, org_id TEXT, owner_id TEXT, current_version TEXT NOT NULL, disabled BOOLEAN NOT NULL DEFAULT FALSE, created_at DOUBLE PRECISION NOT NULL)")
    pg.execute("CREATE TABLE service_definition_versions (definition_id TEXT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE, version TEXT NOT NULL, manifest JSONB NOT NULL, published_by TEXT, published_at DOUBLE PRECISION NOT NULL, PRIMARY KEY (definition_id, version))")
    pg.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (1, 1), (2, 2)")
    pg_schema.migrate()
    assert pg.query_one("SELECT version FROM schema_migrations WHERE version = 3")
    assert pg.query_one("SELECT version FROM schema_migrations WHERE version = 4")
    assert pg.query_one("SELECT indexname FROM pg_indexes WHERE indexname = %s", ("uq_service_definitions_platform_slug",))


def test_catalog_v4_reconciles_legacy_duplicates_and_preserves_all_versions(pg_db):
    # Recreate the actual legacy v3 shape: UNIQUE(slug, scope_type, org_id)
    # permits duplicate platform rows because PostgreSQL treats NULLs as
    # distinct. v4 must repair that state before creating its partial index.
    pg.execute("DROP INDEX IF EXISTS uq_service_definitions_platform_slug")
    pg.execute("DROP INDEX IF EXISTS uq_service_definitions_org_slug")
    pg.execute(
        "ALTER TABLE service_definitions ADD CONSTRAINT "
        "service_definitions_slug_scope_type_org_id_key UNIQUE (slug, scope_type, org_id)"
    )
    pg.execute("DELETE FROM schema_migrations WHERE version = 4")
    pg.execute(
        "INSERT INTO service_definitions "
        "(id, slug, scope_type, owner_id, current_version, disabled, created_at) "
        "VALUES (%s,%s,'platform',%s,%s,FALSE,%s), (%s,%s,'platform',%s,%s,TRUE,%s)",
        # 1.10.0 must beat 1.9.0 semantically (not lexically), but the lower
        # duplicate's disabled state must still restrict the canonical row.
        # Its owner metadata must also survive even though the winner is NULL.
        ("legacy-a", "duplicate", None, "1.10.0", 10.0,
         "legacy-b", "duplicate", "owner-a", "1.9.0", 20.0),
    )
    pg.execute(
        "INSERT INTO service_definition_versions "
        "(definition_id, version, manifest, published_by, published_at) "
        "VALUES "
        "(%s,%s,%s,%s,%s), (%s,%s,%s,%s,%s), "
        "(%s,%s,%s,%s,%s), (%s,%s,%s,%s,%s)",
        ("legacy-a", "1.10.0", '{"version":"1.10.0","image":"example/a:1.10.0"}', "a", 10.0,
         "legacy-a", "1.11.0", '{"version":"1.11.0","image":"example/a:1.11.0"}', "a", 11.0,
         "legacy-b", "1.5.0", '{"version":"1.5.0","image":"example/b:1.5.0"}', "b", 15.0,
         "legacy-b", "1.9.0", '{"version":"1.9.0","image":"example/b:1.9.0"}', "b", 20.0),
    )
    pg.execute(
        "INSERT INTO audit_log(actor_user_id, action, target_type, target_id, meta_json, created_at) "
        "VALUES (%s,%s,%s,%s,%s,%s), (%s,%s,%s,%s,%s,%s)",
        ("a", "catalog.publish", "service_definition", "legacy-a", "{}", "now",
         "b", "catalog.publish", "service_definition", "legacy-b", "{}", "now"),
    )

    pg_schema.migrate()

    rows = pg.query_all(
        "SELECT id, owner_id, current_version, disabled "
        "FROM service_definitions WHERE slug = %s AND scope_type = 'platform'",
        ("duplicate",),
    )
    assert rows == [{
        "id": "legacy-a", "owner_id": "owner-a", "current_version": "1.11.0", "disabled": True,
    }]
    versions = pg.query_all(
        "SELECT definition_id, version FROM service_definition_versions WHERE definition_id = %s ORDER BY version",
        ("legacy-a",),
    )
    assert {row["version"] for row in versions} == {"1.5.0", "1.9.0", "1.10.0", "1.11.0"}
    assert all(row["definition_id"] == "legacy-a" for row in versions)
    assert pg.query_one(
        "SELECT COUNT(*) AS count FROM audit_log "
        "WHERE target_type = %s AND target_id = %s",
        ("service_definition", "legacy-a"),
    )["count"] == 2
    assert pg.query_one("SELECT version FROM schema_migrations WHERE version = 4") == {"version": 4}
    assert pg.query_one("SELECT indexname FROM pg_indexes WHERE indexname = %s", ("uq_service_definitions_platform_slug",))


def test_catalog_v4_rejects_conflicting_duplicate_owners(pg_db):
    pg.execute("DROP INDEX IF EXISTS uq_service_definitions_platform_slug")
    pg.execute("DROP INDEX IF EXISTS uq_service_definitions_org_slug")
    pg.execute(
        "ALTER TABLE service_definitions ADD CONSTRAINT "
        "service_definitions_slug_scope_type_org_id_key UNIQUE (slug, scope_type, org_id)"
    )
    pg.execute("DELETE FROM schema_migrations WHERE version = 4")
    pg.execute(
        "INSERT INTO service_definitions "
        "(id, slug, scope_type, owner_id, current_version, created_at) "
        "VALUES (%s,%s,'platform',%s,%s,%s), (%s,%s,'platform',%s,%s,%s)",
        ("owner-a-row", "conflicting-owners", "owner-a", "1.0.0", 1.0,
         "owner-b-row", "conflicting-owners", "owner-b", "1.1.0", 2.0),
    )
    pg.execute(
        "INSERT INTO service_definition_versions "
        "(definition_id, version, manifest, published_at) VALUES "
        "(%s,%s,%s,%s), (%s,%s,%s,%s)",
        ("owner-a-row", "1.0.0", '{"version":"1.0.0"}', 1.0,
         "owner-b-row", "1.1.0", '{"version":"1.1.0"}', 2.0),
    )

    with pytest.raises(pg_schema.CatalogMigrationError, match="conflicting owners"):
        pg_schema.migrate()

    assert pg.query_one("SELECT version FROM schema_migrations WHERE version = 4") is None
    assert pg.query_one("SELECT indexname FROM pg_indexes WHERE indexname = %s", ("uq_service_definitions_platform_slug",)) is None


def test_catalog_partial_unique_indexes_enforce_scope(pg_db):
    pg.execute(
        "INSERT INTO service_definitions (id, slug, scope_type, current_version, created_at) "
        "VALUES (%s,%s,%s,%s,%s)", ("platform-1", "same", "platform", "1.0.0", 1.0),
    )
    with pytest.raises(Exception):
        pg.execute(
            "INSERT INTO service_definitions (id, slug, scope_type, current_version, created_at) "
            "VALUES (%s,%s,%s,%s,%s)", ("platform-2", "same", "platform", "1.0.0", 2.0),
        )
    pg.execute(
        "INSERT INTO service_definitions (id, slug, scope_type, org_id, current_version, created_at) "
        "VALUES (%s,%s,%s,%s,%s,%s)", ("org-1", "same", "organization", "org-a", "1.0.0", 1.0),
    )
    with pytest.raises(Exception):
        pg.execute(
            "INSERT INTO service_definitions (id, slug, scope_type, org_id, current_version, created_at) "
            "VALUES (%s,%s,%s,%s,%s,%s)", ("org-2", "same", "organization", "org-a", "1.0.0", 2.0),
        )


def test_schema_tables_exist(pg_db):
    names = {r["tablename"] for r in pg.query_all(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'")}
    for t in ("users", "roles", "permissions", "projects", "settings",
              "queued_executions", "kv_store", "executions", "execution_logs",
              "stack_meta", "stack_secrets", "stack_state", "snapshots",
              "orgs", "org_members", "service_definitions", "service_definition_versions",
              "schema_migrations"):
        assert t in names, f"table {t} missing"


def test_kv_store_upsert(pg_db):
    pg.execute("INSERT INTO kv_store (scope, key, value, updated_at) VALUES (%s,%s,%s,%s)",
               ("flags", "a", '{"enabled": true}', 1))
    pg.execute(
        "INSERT INTO kv_store (scope, key, value, updated_at) VALUES (%s,%s,%s,%s) "
        "ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at",
        ("flags", "a", '{"enabled": false}', 2))
    row = pg.query_one("SELECT value FROM kv_store WHERE scope = %s AND key = %s", ("flags", "a"))
    assert row["value"] == {"enabled": False}


def test_database_url_required(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    from storage import pg as pg_mod
    with pytest.raises(RuntimeError):
        pg_mod.database_url()
