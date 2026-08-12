"""PostgreSQL access layer (Fase 7 — Postgres/Neon migration).

Single shared pool over `DATABASE_URL` (required; fail-fast when unset).
Exposes helpers close to the old `sqlite3` usage pattern so per-module
porting is minimal: `execute` runs a statement and autocommits (like the old
sqlite `isolation_level=None`), returns dict-rows for SELECTs, `query_one`
/`query_all` return dicts, and `transaction()` wraps a block in
BEGIN/COMMIT/ROLLBACK.

Placeholders are psycopg native `%s` — ported modules must change `?`
to `%s` (mechanical, per task).
"""
from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from typing import Any, Dict, Iterable, Iterator, List, Optional, Sequence

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_POOL: Optional[ConnectionPool] = None
_LOCK = threading.Lock()
_DATABASE_URL: Optional[str] = None


def database_url() -> str:
    """Resolve DATABASE_URL; raise a clear error when missing."""
    global _DATABASE_URL
    url = os.environ.get("DATABASE_URL") or os.environ.get("TEST_DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is required. Set it to your PostgreSQL/Neon connection "
            "string (e.g. postgres://user:pass@host/db?sslmode=require)."
        )
    _DATABASE_URL = url
    return url


def _pool() -> ConnectionPool:
    global _POOL
    if _POOL is not None:
        return _POOL
    with _LOCK:
        if _POOL is not None:
            return _POOL
        _POOL = ConnectionPool(
            database_url(),
            min_size=1,
            max_size=10,
            open=True,
            kwargs={"row_factory": dict_row},
        )
    return _POOL


def get_conn() -> psycopg.Connection:
    """Borrow a connection from the pool (caller must `put_conn`)."""
    return _pool().getconn()


def put_conn(conn: psycopg.Connection) -> None:
    """Return a borrowed connection to the pool."""
    try:
        _pool().putconn(conn)
    except Exception:
        try:
            conn.close()
        except Exception:
            pass


def ping() -> bool:
    """Verify the database is reachable. Raises on failure."""
    conn = get_conn()
    try:
        conn.autocommit = True
        cur = conn.execute("SELECT 1")
        row = cur.fetchone()
    finally:
        put_conn(conn)
    return row is not None


def execute(sql: str, params: Optional[Sequence[Any]] = None) -> Any:
    """Run a statement; autocommit (like old sqlite isolation_level=None).
    Returns rows (dicts) for SELECTs."""
    conn = get_conn()
    try:
        conn.autocommit = True
        cur = conn.execute(sql, params or ())
        rows = None
        if cur.description is not None:
            rows = cur.fetchall()
        return rows
    finally:
        put_conn(conn)


def executemany(sql: str, seq_params: Iterable[Sequence[Any]]) -> None:
    """Run a statement for many parameter sets inside one transaction."""
    conn = get_conn()
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.executemany(sql, seq_params)
    finally:
        put_conn(conn)


def query_one(sql: str, params: Optional[Sequence[Any]] = None) -> Optional[Dict[str, Any]]:
    """Fetch one row as dict, or None."""
    rows = execute(sql, params)
    if isinstance(rows, list) and rows:
        return rows[0]
    return None


def query_all(sql: str, params: Optional[Sequence[Any]] = None) -> List[Dict[str, Any]]:
    """Fetch all rows as dicts."""
    rows = execute(sql, params)
    return list(rows) if isinstance(rows, list) else []


@contextmanager
def transaction() -> Iterator[psycopg.Connection]:
    """Run a block inside one transaction (commit on success, rollback on error)."""
    conn = get_conn()
    try:
        conn.autocommit = False
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        put_conn(conn)


def reset_connection_pool() -> None:
    """Close the pool (used by tests between fixtures)."""
    global _POOL
    with _LOCK:
        if _POOL is not None:
            try:
                _POOL.close()
            except Exception:
                pass
            _POOL = None
