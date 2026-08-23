"""Graceful worker drain manager before reboot or maintenance shutdown (UC480)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

WORKER_DRAIN_SCOPE = "worker_drain"


def initiate_worker_drain(worker_id: str, timeout_seconds: int = 300) -> Dict[str, Any]:
    """Put worker in draining mode so it stops claiming new tasks and completes active runs (UC480)."""
    clean_id = worker_id.strip()
    entry = {
        "worker_id": clean_id,
        "status": "draining",
        "draining": True,
        "initiated_at": time.time(),
        "timeout_seconds": timeout_seconds,
    }
    kv_set(WORKER_DRAIN_SCOPE, clean_id, entry)
    logger.info(f"Worker {clean_id} entered draining state (timeout={timeout_seconds}s)")
    return entry


def get_worker_drain_status(worker_id: str, active_jobs_count: int = 0) -> Dict[str, Any]:
    """Check if worker is currently in drain mode and safe to terminate (UC480)."""
    clean_id = worker_id.strip()
    val = kv_get(WORKER_DRAIN_SCOPE, clean_id)

    if not val or not isinstance(val, dict) or not val.get("draining"):
        return {
            "worker_id": clean_id,
            "draining": False,
            "can_shutdown": False,
            "active_jobs_count": active_jobs_count,
        }

    can_shutdown = bool(active_jobs_count == 0)

    return {
        "worker_id": clean_id,
        "draining": True,
        "can_shutdown": can_shutdown,
        "active_jobs_count": active_jobs_count,
        "status": "ready_for_shutdown" if can_shutdown else "draining_active_jobs",
    }
