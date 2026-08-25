"""Automated periodic snapshot scheduler (UC541)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

SCHEDULE_SCOPE = "snapshot_schedules"


def schedule_periodic_snapshots(
    project_id: str,
    stack: str,
    cron_interval: str = "@daily",
) -> Dict[str, Any]:
    """Register or update automated snapshot schedule for a stack (UC541)."""
    key = f"{project_id.strip()}/{stack.strip()}"
    entry = {
        "project_id": project_id,
        "stack": stack,
        "cron_interval": cron_interval,
        "enabled": True,
        "created_at": time.time(),
        "last_run_at": None,
    }
    kv_set(SCHEDULE_SCOPE, key, entry)
    logger.info(f"Registered snapshot schedule for {key}: {cron_interval}")
    return {"success": True, **entry}


def get_snapshot_schedule(project_id: str, stack: str) -> Dict[str, Any]:
    """Retrieve snapshot schedule for a stack."""
    key = f"{project_id.strip()}/{stack.strip()}"
    val = kv_get(SCHEDULE_SCOPE, key)
    return dict(val) if isinstance(val, dict) else {}
