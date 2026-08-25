"""Project-level advisory lock for preventing concurrent mutating operations across stacks.

All stack operations that modify state (apply, destroy, refresh, rollback, strip)
should acquire this lock before starting and release it after finishing.
"""
from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from storage import pg

LOCK_PREFIX = "radas.project_lock:"


def _lock_key(project_id: str) -> str:
    return LOCK_PREFIX + project_id


def acquire(project_id: str, *, actor: str, operation: str, run_id: Optional[str] = None) -> dict[str, Any]:
    """Acquire a project-level advisory lock and record the lease.

    Returns a dict with 'ok' and 'lock' if acquired, or 'ok': False with 'lock' if already held.
    """
    lock_key = _lock_key(project_id)
    now = time.time()
    lease_id = str(uuid.uuid4())

    with pg.transaction() as conn:
        # Acquire advisory lock (transaction-level; released on rollback/commit)
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (lock_key,))

        # Check if there is an existing active lease
        existing = conn.execute(
            "SELECT * FROM project_locks WHERE project_id = %s AND expires_at > %s FOR UPDATE",
            (project_id, now),
        ).fetchone()
        if existing:
            return {"ok": False, "lock": dict(existing)}

        # Insert new lease
        expires_at = now + 3600  # 1 hour timeout
        conn.execute(
            "INSERT INTO project_locks (id, project_id, actor, operation, run_id, acquired_at, expires_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (lease_id, project_id, actor, operation, run_id, now, expires_at),
        )
        return {"ok": True, "lock": {"id": lease_id, "project_id": project_id, "actor": actor,
                                     "operation": operation, "run_id": run_id,
                                     "acquired_at": now, "expires_at": expires_at}}


def release(project_id: str, *, lock_id: Optional[str] = None, force: bool = False) -> dict[str, Any]:
    """Release the project lock. If force=True, release regardless of lease id."""
    with pg.transaction() as conn:
        # Acquire advisory lock to prevent race
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (_lock_key(project_id),))
        if lock_id:
            result = conn.execute(
                "DELETE FROM project_locks WHERE project_id = %s AND id = %s RETURNING *",
                (project_id, lock_id),
            )
        else:
            result = conn.execute(
                "DELETE FROM project_locks WHERE project_id = %s RETURNING *",
                (project_id,),
            )
        if result.rowcount == 0 and not force:
            return {"ok": False, "error": "No active lock found"}
        return {"ok": True, "released": result.rowcount > 0, "previous": result.fetchone()}


def get_lock(project_id: str) -> Optional[dict[str, Any]]:
    """Return the active lock for a project, if any."""
    now = time.time()
    row = pg.query_one(
        "SELECT * FROM project_locks WHERE project_id = %s AND expires_at > %s",
        (project_id, now),
    )
    return dict(row) if row else None


def cleanup_expired() -> int:
    """Remove expired locks."""
    now = time.time()
    with pg.transaction() as conn:
        result = conn.execute("DELETE FROM project_locks WHERE expires_at <= %s", (now,))
        return result.rowcount