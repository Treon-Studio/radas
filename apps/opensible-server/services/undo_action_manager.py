"""Time-windowed undo action registry for non-destructive operations (UC597)."""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

UNDO_SCOPE = "undo_action_queue"


def register_undoable_action(
    user_id: str,
    action_type: str,
    revert_fn_data: Dict[str, Any],
    ttl_seconds: int = 10,
) -> Dict[str, Any]:
    """Register a reversible action with an expiration window (UC597)."""
    action_id = f"undo-{uuid.uuid4().hex[:10]}"
    now = time.time()
    expires_at = now + max(1, int(ttl_seconds))

    entry = {
        "action_id": action_id,
        "user_id": user_id.strip(),
        "action_type": action_type.strip(),
        "revert_data": revert_fn_data,
        "registered_at": now,
        "expires_at": expires_at,
        "executed": False,
    }
    kv_set(UNDO_SCOPE, action_id, entry)
    logger.info(f"Registered undoable action {action_id} for user {user_id} (ttl={ttl_seconds}s)")

    return {"success": True, "action_id": action_id, "expires_at": expires_at}


def execute_undo_action(action_id: str) -> Dict[str, Any]:
    """Execute the rollback data for the registered undo token if still valid (UC597)."""
    entry = kv_get(UNDO_SCOPE, action_id)
    if not entry or not isinstance(entry, dict):
        return {"success": False, "reason": "Action not found"}

    if entry.get("executed"):
        return {"success": False, "reason": "Action already undone"}

    now = time.time()
    if now > entry.get("expires_at", 0):
        return {"success": False, "reason": "Undo window expired"}

    entry["executed"] = True
    entry["undone_at"] = now
    kv_set(UNDO_SCOPE, action_id, entry)

    logger.info(f"Executed undo for action {action_id}")
    return {"success": True, "reverted_data": entry["revert_data"]}
