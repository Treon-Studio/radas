"""Worker resource utilization metrics tracker (UC534)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

WORKER_METRICS_SCOPE = "worker_metrics"


def record_worker_metrics(
    worker_id: str,
    cpu_percent: float,
    memory_percent: float,
    disk_percent: float,
    recorded_at: Optional[float] = None,
) -> Dict[str, Any]:
    """Record heartbeat CPU, RAM, and disk utilization metrics for a worker (UC534)."""
    clean_id = worker_id.strip()
    now = recorded_at if recorded_at is not None else time.time()
    entry = {
        "worker_id": clean_id,
        "cpu_percent": float(cpu_percent),
        "memory_percent": float(memory_percent),
        "disk_percent": float(disk_percent),
        "recorded_at": now,
    }
    kv_set(WORKER_METRICS_SCOPE, clean_id, entry)
    logger.info(f"Recorded metrics for worker {clean_id}: CPU={cpu_percent}%, MEM={memory_percent}%")
    return entry


def get_worker_metrics(worker_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve raw metrics for a worker."""
    val = kv_get(WORKER_METRICS_SCOPE, worker_id.strip())
    return dict(val) if isinstance(val, dict) else None
