"""Dedicated ephemeral preview environment quota controller (UC501)."""
from __future__ import annotations

import logging
from typing import Any, Dict

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

PREVIEW_QUOTA_SCOPE = "preview_quotas"
DEFAULT_MAX_PREVIEWS = 5


def set_preview_quota(project_id: str, max_previews: int) -> None:
    """Configure maximum permitted concurrent ephemeral preview environments for a project (UC501)."""
    clean_pid = project_id.strip()
    kv_set(PREVIEW_QUOTA_SCOPE, clean_pid, {"max_previews": max(1, int(max_previews))})
    logger.info(f"Configured preview quota for project {clean_pid}: max={max_previews}")


def evaluate_preview_quota(
    project_id: str,
    current_count: int,
    requested_previews: int = 1,
) -> Dict[str, Any]:
    """Evaluate whether requested preview environments exceed the project quota (UC501)."""
    clean_pid = project_id.strip()
    data = kv_get(PREVIEW_QUOTA_SCOPE, clean_pid)
    max_previews = int(data.get("max_previews", DEFAULT_MAX_PREVIEWS)) if data and isinstance(data, dict) else DEFAULT_MAX_PREVIEWS

    cur = max(0, int(current_count))
    req = max(1, int(requested_previews))
    allowed = (cur + req) <= max_previews
    remaining = max(0, max_previews - (cur + req)) if allowed else 0

    return {
        "allowed": allowed,
        "project_id": clean_pid,
        "max_previews": max_previews,
        "current_count": cur,
        "requested": req,
        "remaining": remaining,
    }
