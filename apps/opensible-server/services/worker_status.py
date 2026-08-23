"""Worker online/offline health monitor and dashboard reporter (UC535)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from services.worker_metrics import get_worker_metrics
from storage.kv import kv_list

logger = logging.getLogger(__name__)


def get_worker_health_status(
    worker_id: str,
    timeout_seconds: int = 60,
    current_time: Optional[float] = None,
) -> Dict[str, Any]:
    """Evaluate if worker is currently online or offline based on heartbeat freshness (UC535)."""
    now = current_time if current_time is not None else time.time()
    metrics = get_worker_metrics(worker_id)

    if not metrics:
        return {
            "worker_id": worker_id,
            "status": "offline",
            "online": False,
            "reason": "No heartbeat received",
            "last_seen": None,
        }

    recorded_at = float(metrics.get("recorded_at") or 0.0)
    elapsed = now - recorded_at

    if elapsed > timeout_seconds:
        return {
            "worker_id": worker_id,
            "status": "offline",
            "online": False,
            "reason": f"Heartbeat timed out ({elapsed:.1f}s > {timeout_seconds}s)",
            "last_seen": recorded_at,
            "metrics": metrics,
        }

    return {
        "worker_id": worker_id,
        "status": "online",
        "online": True,
        "last_seen": recorded_at,
        "metrics": metrics,
    }
