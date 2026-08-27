"""Schema reproducibility gate (Task 0.3).

Guards that ``storage/pg_schema.migrate()`` is the single canonical schema
authority:

- applying the migrations twice is idempotent (identical tables, columns,
  indexes, and migration versions),
- a fresh install and an upgrade from a legacy v1-only database converge on
  the same schema,
- every numbered SQL file under ``storage/migrations/`` is reachable from the
  canonical migration runner, so no dead DDL can silently drift from the
  schema the server actually runs.
"""
from __future__ import annotations

import pytest

from storage import pg, pg_schema


def _snapshot() -> dict[str, list[str]]:
    with pg.transaction() as conn:
        return pg_schema.schema_snapshot(conn)


def test_migrate_twice_is_idempotent(pg_db):
    first = _snapshot()
    pg_schema.migrate()
    second = _snapshot()
    assert first == second


def test_migration_versions_match_registry(pg_db):
    snapshot = _snapshot()
    assert snapshot["migration_versions"] == [
        str(version) for version, _ in pg_schema.MIGRATIONS
    ]


def test_fresh_and_upgrade_from_v1_converge(pg_db):
    fresh = _snapshot()
    # Simulate a legacy deployment that only ever applied v1, then upgrade it
    # to head through the canonical runner.
    with pg.transaction() as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
        conn.execute(
            "CREATE TABLE schema_migrations ("
            "version INTEGER PRIMARY KEY, applied_at REAL)"
        )
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (1, 1.0)"
        )
        for statement in pg_schema.MIGRATIONS[0][1]:
            conn.execute(statement)
    pg_schema.migrate()
    upgraded = _snapshot()
    assert upgraded == fresh


def test_no_unreachable_numbered_sql_files():
    # Every numbered SQL file in storage/migrations/ must be reachable from
    # the canonical migration runner. Unreachable files are dead DDL that can
    # silently drift from the schema the server actually applies.
    assert pg_schema.unreachable_sql_migrations() == []


def test_migrate_fails_when_numbered_sql_file_is_unreachable(pg_db, tmp_path, monkeypatch):
    (tmp_path / "011_ghost.sql").write_text("CREATE TABLE ghost (id TEXT);\n")
    monkeypatch.setattr(pg_schema, "MIGRATIONS_DIR", tmp_path)
    with pytest.raises(RuntimeError, match="not reachable"):
        pg_schema.migrate()


def test_registered_sql_file_is_applied_by_canonical_runner(pg_db, tmp_path, monkeypatch):
    (tmp_path / "900_gate_probe.sql").write_text(
        "-- reproducibility gate probe\nCREATE TABLE gate_probe (id TEXT PRIMARY KEY);\n"
    )
    monkeypatch.setattr(pg_schema, "MIGRATIONS_DIR", tmp_path)
    monkeypatch.setattr(
        pg_schema, "SQL_MIGRATION_SOURCES", {"900_gate_probe.sql": 900}
    )
    pg_schema.migrate()
    assert pg.query_one(
        "SELECT to_regclass(%s) AS name", ("public.gate_probe",)
    )["name"] == "gate_probe"
    assert pg.query_one(
        "SELECT version FROM schema_migrations WHERE version = 900"
    ) == {"version": 900}


def test_sql_file_duplicating_inline_ddl_is_rejected(pg_db, tmp_path, monkeypatch):
    (tmp_path / "025_duplicate.sql").write_text("CREATE TABLE duplicate_probe (id TEXT);\n")
    monkeypatch.setattr(pg_schema, "MIGRATIONS_DIR", tmp_path)
    monkeypatch.setattr(
        pg_schema, "SQL_MIGRATION_SOURCES", {"025_duplicate.sql": 25}
    )
    with pytest.raises(RuntimeError, match="schema authority conflict"):
        pg_schema.migrate()
