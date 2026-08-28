"""Atomic project-wide admission leases for service and legacy executions."""
from __future__ import annotations

import time
import uuid
from typing import Any

from storage import pg

LOCK_PREFIX = "radas.project_admission:"


def _lock(conn, project_id: str) -> None:
    conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (LOCK_PREFIX + project_id,))


def reclaim_expired(conn, project_id: str | None = None, now: float | None = None) -> int:
    now = time.time() if now is None else now
    if project_id:
        _lock(conn, project_id)
        result = conn.execute("DELETE FROM project_admission_leases WHERE project_id=%s AND lease_until IS NOT NULL AND lease_until < %s", (project_id, now))
    else:
        result = conn.execute("DELETE FROM project_admission_leases WHERE lease_until IS NOT NULL AND lease_until < %s", (now,))
    return result.rowcount


def active_count(conn, project_id: str) -> int:
    now = time.time()
    return int(conn.execute("SELECT COUNT(*) AS count FROM project_admission_leases WHERE project_id=%s AND status IN ('reserved','active') AND (lease_until IS NULL OR lease_until >= %s)", (project_id, now)).fetchone()["count"] or 0)


def admit(conn, project_id: str, *, limit: int, kind: str, reference_id: str, worker_id: str | None = None, lease_until: float | None = None) -> dict[str, Any] | None:
    _lock(conn, project_id)
    reclaim_expired(conn, project_id)
    existing = conn.execute("SELECT * FROM project_admission_leases WHERE kind=%s AND reference_id=%s", (kind, reference_id)).fetchone()
    if existing:
        return dict(existing)
    if limit > 0 and active_count(conn, project_id) >= limit:
        try:
            from storage.metrics_counters import incr
            incr("lock_contention_denials_total")
        except Exception:
            pass
        return None
    now = time.time()
    lease = {"id": str(uuid.uuid4()), "project_id": project_id, "kind": kind, "reference_id": reference_id, "worker_id": worker_id, "status": "active", "lease_until": lease_until, "created_at": now, "updated_at": now}
    conn.execute("INSERT INTO project_admission_leases (id,project_id,kind,reference_id,worker_id,status,lease_until,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", tuple(lease.values()))
    return lease


def release(conn, lease_id: str | None = None, *, reference_id: str | None = None) -> bool:
    if lease_id:
        result = conn.execute("DELETE FROM project_admission_leases WHERE id=%s", (lease_id,))
    else:
        result = conn.execute("DELETE FROM project_admission_leases WHERE reference_id=%s", (reference_id,))
    return bool(result.rowcount)
