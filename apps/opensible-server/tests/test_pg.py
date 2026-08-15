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
    # reset_schema applies v1-v3; calling migrate again is safe.
    pg_schema.migrate()
    versions = pg.query_all("SELECT version FROM schema_migrations ORDER BY version")
    assert versions == [{"version": 1}, {"version": 2}, {"version": 3}]


def test_schema_v3_catalog_tables_exist(pg_db):
    assert pg.query_one("SELECT version FROM schema_migrations WHERE version = 3") == {"version": 3}
    for table in ("service_definitions", "service_definition_versions"):
        assert pg.query_one("SELECT to_regclass(%s) AS name", (f"public.{table}",))["name"] == table


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
