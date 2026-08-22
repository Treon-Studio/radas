"""Remote state lock for preventing concurrent mutations across workers (UC331).

Each stack using a remote backend (S3/OBS) gets a lock keyed by (stack, backend_type, backend_key).
The lock is stored in PostgreSQL and uses advisory locks for atomicity.
"""
from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from storage import pg

LOCK_PREFIX = "radas.remote_state_lock:"


def _lock_key(stack: str, backend_type: str, backend_key: str) -> str:
    return f"{LOCK_PREFIX}{stack}:{backend_type}:{backend_key}"


def acquire(stack: str, backend_type: str, backend_key: str, *, actor: str, operation: str, run_id: Optional[str] = None) -> dict[str, Any]:
    """Acquire a remote-state advisory lock and record the lease."""
    lock_key = _lock_key(stack, backend_type, backend_key)
    now = time.time()
    lease_id = str(uuid.uuid4())

    with pg.transaction() as conn:
        # Advisory lock (transaction-level)
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (lock_key,))

        # Check existing active lease
        existing = conn.execute(
            "SELECT * FROM remote_state_locks WHERE stack = %s AND backend_type = %s AND backend_key = %s AND expires_at > %s FOR UPDATE",
            (stack, backend_type, backend_key, now),
        ).fetchone()
        if existing:
            return {"ok": False, "lock": dict(existing)}

        expires_at = now + 3600  # 1 hour
        conn.execute(
            "INSERT INTO remote_state_locks (id, stack, backend_type, backend_key, actor, operation, run_id, acquired_at, expires_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (lease_id, stack, backend_type, backend_key, actor, operation, run_id, now, expires_at),
        )
        return {"ok": True, "lock": {"id": lease_id, "stack": stack, "backend_type": backend_type,
                                     "backend_key": backend_key, "actor": actor,
                                     "operation": operation, "run_id": run_id,
                                     "acquired_at": now, "expires_at": expires_at}}


def release(stack: str, backend_type: str, backend_key: str, *, lock_id: Optional[str] = None, force: bool = False) -> dict[str, Any]:
    """Release the remote state lock."""
    with pg.transaction() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (_lock_key(stack, backend_type, backend_key),))
        if lock_id:
            result = conn.execute(
                "DELETE FROM remote_state_locks WHERE stack = %s AND backend_type = %s AND backend_key = %s AND id = %s RETURNING *",
                (stack, backend_type, backend_key, lock_id),
            )
        else:
            result = conn.execute(
                "DELETE FROM remote_state_locks WHERE stack = %s AND backend_type = %s AND backend_key = %s RETURNING *",
                (stack, backend_type, backend_key),
            )
        if result.rowcount == 0 and not force:
            return {"ok": False, "error": "No active lock found"}
        return {"ok": True, "released": result.rowcount > 0, "previous": result.fetchone()}


def get_lock(stack: str, backend_type: str, backend_key: str) -> Optional[dict[str, Any]]:
    now = time.time()
    row = pg.query_one(
        "SELECT * FROM remote_state_locks WHERE stack = %s AND backend_type = %s AND backend_key = %s AND expires_at > %s",
        (stack, backend_type, backend_key, now),
    )
    return dict(row) if row else None


def cleanup_expired() -> int:
    now = time.time()
    with pg.transaction() as conn:
        result = conn.execute("DELETE FROM remote_state_locks WHERE expires_at <= %s", (now,))
        return result.rowcount