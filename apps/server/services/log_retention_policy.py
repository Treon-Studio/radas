"""Project log retention duration policy and lifecycle manager (UC519)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

LOG_RETENTION_SCOPE = "log_retention"
DEFAULT_RETENTION_DAYS = 90


def set_project_log_retention(project_id: str, retention_days: int) -> Dict[str, Any]:
    """Configure log retention duration in days for a specific project (UC519)."""
    clean_pid = project_id.strip()
    days = max(1, int(retention_days))

    entry = {
        "project_id": clean_pid,
        "retention_days": days,
        "updated_at": time.time(),
    }
    kv_set(LOG_RETENTION_SCOPE, clean_pid, entry)
    logger.info(f"Configured log retention for project {clean_pid}: {days} days")
    return {"success": True, **entry}


def get_project_log_retention(project_id: str) -> int:
    """Retrieve configured log retention days for a project (fallback to default 90 days) (UC519)."""
    clean_pid = project_id.strip()
    data = kv_get(LOG_RETENTION_SCOPE, clean_pid)
    if data and isinstance(data, dict) and "retention_days" in data:
        return int(data["retention_days"])
    return DEFAULT_RETENTION_DAYS
