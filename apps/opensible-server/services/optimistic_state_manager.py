"""Optimistic UI update transaction and automatic rollback manager (UC567)."""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

OPTIMISTIC_SCOPE = "optimistic_updates"


def apply_optimistic_update(
    entity_type: str,
    entity_id: str,
    prev_state: Dict[str, Any],
    next_state: Dict[str, Any],
) -> Dict[str, Any]:
    """Record an optimistic state mutation pending server confirmation (UC567)."""
    update_id = f"opt-{uuid.uuid4().hex[:10]}"
    now = time.time()

    entry = {
        "update_id": update_id,
        "entity_type": entity_type.strip(),
        "entity_id": entity_id.strip(),
        "prev_state": prev_state,
        "next_state": next_state,
        "current_state": next_state,
        "status": "pending",
        "applied_at": now,
    }
    kv_set(OPTIMISTIC_SCOPE, update_id, entry)
    logger.info(f"Applied optimistic update {update_id} on {entity_type}:{entity_id}")
    return entry


def revert_optimistic_update(update_id: str) -> Dict[str, Any]:
    """Revert optimistic mutation back to previous state upon API error (UC567)."""
    entry = kv_get(OPTIMISTIC_SCOPE, update_id)
    if not entry or not isinstance(entry, dict):
        raise ValueError(f"Optimistic update {update_id} not found")

    entry["status"] = "reverted"
    entry["current_state"] = entry["prev_state"]
    entry["reverted_at"] = time.time()

    kv_set(OPTIMISTIC_SCOPE, update_id, entry)
    logger.info(f"Reverted optimistic update {update_id}")
    return entry


def commit_optimistic_update(update_id: str) -> Dict[str, Any]:
    """Confirm server successfully accepted the state update (UC567)."""
    entry = kv_get(OPTIMISTIC_SCOPE, update_id)
    if not entry or not isinstance(entry, dict):
        raise ValueError(f"Optimistic update {update_id} not found")

    entry["status"] = "committed"
    entry["committed_at"] = time.time()

    kv_set(OPTIMISTIC_SCOPE, update_id, entry)
    logger.info(f"Committed optimistic update {update_id}")
    return entry
