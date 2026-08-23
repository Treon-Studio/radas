"""Quick project switcher LRU history tracker (UC518)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

RECENT_PROJECTS_SCOPE = "recent_projects"
MAX_HISTORY = 20


def record_project_access(user_id: str, project_id: str) -> Dict[str, Any]:
    """Record a user project access event and prioritize it at the top of the LRU history (UC518)."""
    clean_user = user_id.strip()
    clean_proj = project_id.strip()
    now = time.time()

    data = kv_get(RECENT_PROJECTS_SCOPE, clean_user)
    history: List[Dict[str, Any]] = data if isinstance(data, list) else []

    # Remove existing entry for same project if present
    filtered = [entry for entry in history if entry.get("project_id") != clean_proj]

    # Prepend newest access
    new_entry = {"project_id": clean_proj, "accessed_at": now}
    updated_history = [new_entry] + filtered
    updated_history = updated_history[:MAX_HISTORY]

    kv_set(RECENT_PROJECTS_SCOPE, clean_user, updated_history)
    logger.info(f"Updated quick project access for user {clean_user}: {clean_proj}")
    return {"success": True, "user_id": clean_user, "recent": updated_history}


def get_recent_projects(user_id: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Retrieve top N most recently accessed projects for the user (UC518)."""
    clean_user = user_id.strip()
    data = kv_get(RECENT_PROJECTS_SCOPE, clean_user)
    history: List[Dict[str, Any]] = data if isinstance(data, list) else []
    return history[:limit]
