"""SQLite-compatible facade over the Postgres pool (Fase 7 — porting bridge).

The legacy storage modules (`auth_db`, `config_db`, `index_db`) exposed
``sqlite3.Connection`` objects that services consumed with:
  - ``conn.execute("... ? ...", (args,))``      -- ``?`` placeholders
  - ``row["col"]`` / ``row[0]``                  -- sqlite3.Row access
  - ``conn.execute("BEGIN"/"COMMIT"/"ROLLBACK")`` -- explicit transactions
  - ``fetchone()`` / ``fetchall()`` / ``executemany()``

This module provides a ``CompatConnection`` that wraps a pooled psycopg
connection and preserves that contract: ``?`` is translated to ``%s``
(lexer-safe), rows support both by-name and positional access, and explicit
BEGIN/COMMIT/ROLLBACK statements map to real psycopg transactions. Services
keep working unchanged; only the storage module's import line changes.
"""
from __future__ import annotations

import re
import threading
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple

from storage import pg

# Translate `?` placeholders to psycopg `%s`, but never inside a quoted
# string literal (e.g. SQL with a literal '?'). Simple state machine.
_PLACEHOLDER_RE = re.compile(r"(\?)|('[^']*')")


def _translate(sql: str) -> str:
    out: List[str] = []
    in_str = False
    for ch in sql:
        if ch == "'":
            in_str = not in_str
        if ch == "?" and not in_str:
            out.append("%s")
        else:
            out.append(ch)
    return "".join(out)


class CompatRow:
    """Dict-like row supporting ``row['col']`` and ``row[0]`` (sqlite3.Row style)."""

    __slots__ = ("_data", "_order")

    def __init__(self, data: Dict[str, Any], order: List[str]):
        self._data = data
        self._order = order

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return self._data[self._order[key]]
        return self._data[key]

    def __contains__(self, key: str) -> bool:
        return key in self._data

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def keys(self) -> List[str]:
        return list(self._order)

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<CompatRow {self._data!r}>"


class CompatCursor:
    """Cursor-like wrapper: execute + fetchone/fetchall returning CompatRow."""

    def __init__(self, conn: "CompatConnection", psycopg_cursor: Any):
        self._conn = conn
        self._cur = psycopg_cursor
        self._rows: List[CompatRow] = []
        self._idx = 0
        self.description: Optional[Any] = None

    def _finalize(self) -> None:
        if self._cur.description is None:
            self._rows = []
            self.description = None
            return
        self.description = self._cur.description
        cols = [d.name for d in self._cur.description]
        raw = self._cur.fetchall()
        self._rows = [CompatRow(r, cols) for r in raw]
        self._idx = 0

    def fetchone(self) -> Optional[CompatRow]:
        if self._idx >= len(self._rows):
            return None
        row = self._rows[self._idx]
        self._idx += 1
        return row

    def fetchall(self) -> List[CompatRow]:
        rows = self._rows[self._idx:]
        self._idx = len(self._rows)
        return rows

    def __iter__(self) -> Iterator[CompatRow]:
        return iter(self._rows)


class CompatConnection:
    """sqlite3-compatible facade over a pooled psycopg connection."""

    def __init__(self) -> None:
        self._raw = pg.get_conn()
        self._raw.autocommit = True  # statement-level autocommit like sqlite isolation_level=None
        self.row_factory = None  # accepted for API compatibility; rows are CompatRow
        self._in_txn = False
        self._closed = False

    # ------------------------------------------------------------------
    def _statement(self, sql: str) -> Tuple[str, bool]:
        """Return (translated_sql, is_txn_control)."""
        upper = sql.strip().upper()
        if upper.startswith("BEGIN") or upper.startswith("START TRANSACTION"):
            return "", True
        if upper.startswith("COMMIT"):
            return "", True
        if upper.startswith("ROLLBACK"):
            return "", True
        return _translate(sql), False

    def execute(self, sql: str, params: Optional[Sequence[Any]] = None) -> CompatCursor:
        stmt, txn = self._statement(sql)
        if txn:
            if stmt == "" and "BEGIN" in sql.upper():
                self._raw.autocommit = False
                self._in_txn = True
            elif "COMMIT" in sql.upper():
                if self._in_txn:
                    self._raw.commit()
                    self._in_txn = False
                self._raw.autocommit = True
            elif "ROLLBACK" in sql.upper():
                if self._in_txn:
                    self._raw.rollback()
                    self._in_txn = False
                self._raw.autocommit = True
            return CompatCursor(self, self._raw.cursor())
        cur = self._raw.execute(stmt, params or ())
        cc = CompatCursor(self, cur)
        cc._finalize()
        return cc

    def executemany(self, sql: str, seq_params: Sequence[Sequence[Any]]) -> None:
        stmt, _ = self._statement(sql)
        with self._raw.cursor() as cur:
            cur.executemany(stmt, seq_params)

    def executescript(self, script: str) -> None:
        # Schema is managed by pg_schema.migrate(); legacy executescript is a no-op.
        return None

    def commit(self) -> None:
        if self._in_txn:
            self._raw.commit()
            self._in_txn = False
        self._raw.autocommit = True

    def rollback(self) -> None:
        if self._in_txn:
            self._raw.rollback()
            self._in_txn = False
        self._raw.autocommit = True

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            if self._in_txn:
                self._raw.rollback()
        except Exception:
            pass
        self._in_txn = False
        pg.put_conn(self._raw)

    def cursor(self) -> CompatCursor:
        return CompatCursor(self, self._raw.cursor())

    def __enter__(self) -> "CompatConnection":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()


_TLS = threading.local()


def get_conn() -> CompatConnection:
    """Return a sqlite3-compatible connection backed by Postgres.

    Mirrors the old sqlite thread-local pattern: one CompatConnection per
    thread, so services that call ``get_conn()`` per operation without an
    explicit close() reuse the same underlying pooled connection instead of
    exhausting the pool. ``close()`` releases it back to the pool.
    """
    conn = getattr(_TLS, "conn", None)
    if conn is not None and not conn._closed:
        return conn
    conn = CompatConnection()
    _TLS.conn = conn
    return conn


def close_all() -> None:
    pg.reset_connection_pool()
    if hasattr(_TLS, "conn"):
        _TLS.conn = None
