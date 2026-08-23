"""User session inactivity tracker and auto-lock manager (UC423)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

from storage.kv import kv_delete, kv_get, kv_set

logger = logging.getLogger(__name__)

SESSION_ACTIVITY_SCOPE = "session_activity"


def record_session_activity(session_token: str, user_id: str = "") -> None:
    """Update last active timestamp for a user session (UC423)."""
    token_key = session_token[-32:] if len(session_token) > 32 else session_token
    payload = {
        "user_id": user_id,
        "last_active_at": time.time(),
    }
    kv_set(SESSION_ACTIVITY_SCOPE, token_key, payload)


def is_session_inactive(session_token: str, max_idle_seconds: float = 1800.0) -> bool:
    """Check if a session has timed out due to inactivity (UC423)."""
    token_key = session_token[-32:] if len(session_token) > 32 else session_token
    data = kv_get(SESSION_ACTIVITY_SCOPE, token_key)
    if not data or not isinstance(data, dict):
        return False

    last_active = float(data.get("last_active_at") or 0.0)
    idle_time = time.time() - last_active
    return idle_time > max_idle_seconds
