"""Unit tests for the sqlite3-compatible Postgres facade (Fase 7 — B0 bridge)."""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/radas_test")

import pytest

from storage import pg_compat, pg_schema


@pytest.fixture(autouse=True)
def pg_db():
    pg_compat.close_all()
    pg_schema.reset_schema()
    yield
    pg_compat.close_all()


def test_execute_placeholder_translation(pg_db):
    conn = pg_compat.get_conn()
    try:
        conn.execute("INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
                     ("k1", "{}", "now"))
        row = conn.execute("SELECT * FROM settings WHERE key = ?", ("k1",)).fetchone()
        assert row["key"] == "k1"
        assert row[0] == "k1"  # positional access like sqlite3.Row
    finally:
        conn.close()


def test_fetchall_returns_rows(pg_db):
    conn = pg_compat.get_conn()
    try:
        for i in range(3):
            conn.execute("INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
                         (f"k{i}", "{}", "now"))
        rows = conn.execute("SELECT key FROM settings ORDER BY key").fetchall()
        assert [r[0] for r in rows] == ["k0", "k1", "k2"]
    finally:
        conn.close()


def test_begin_commit_rollback(pg_db):
    conn = pg_compat.get_conn()
    try:
        conn.execute("BEGIN")
        conn.execute("INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
                     ("tx1", "{}", "now"))
        conn.execute("COMMIT")
        assert conn.execute("SELECT COUNT(*) AS n FROM settings WHERE key = ?", ("tx1",)).fetchone()["n"] == 1

        conn.execute("BEGIN")
        conn.execute("INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
                     ("tx2", "{}", "now"))
        conn.execute("ROLLBACK")
        assert conn.execute("SELECT COUNT(*) AS n FROM settings WHERE key = ?", ("tx2",)).fetchone()["n"] == 0
    finally:
        conn.close()


def test_placeholder_inside_string_not_translated(pg_db):
    conn = pg_compat.get_conn()
    try:
        conn.execute("INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
                     ("q?", "{}", "now"))
        row = conn.execute("SELECT key FROM settings WHERE key = ?", ("q?",)).fetchone()
        assert row["key"] == "q?"
    finally:
        conn.close()


def test_executemany(pg_db):
    conn = pg_compat.get_conn()
    try:
        conn.executemany(
            "INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
            [("m0", "{}", "now"), ("m1", "{}", "now")],
        )
        assert conn.execute("SELECT COUNT(*) AS n FROM settings WHERE key LIKE ?", ("m%",)).fetchone()["n"] == 2
    finally:
        conn.close()
