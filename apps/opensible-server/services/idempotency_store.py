"""Idempotency store caching mutation responses to prevent duplicate operations (UC458)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)


def check_or_set_idempotency(
    scope: str,
    idempotency_key: str,
    response_payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Check if operation has cached result or persist response payload under idempotency key (UC458)."""
    kv_scope = f"idempotency_{scope.strip()}"
    clean_key = idempotency_key.strip()

    if response_payload is not None:
        entry = {
            "response": response_payload,
            "saved_at": time.time(),
        }
        kv_set(kv_scope, clean_key, entry)
        logger.info(f"Saved idempotency cache for {kv_scope}/{clean_key}")
        return {"cached": False, "saved": True}

    val = kv_get(kv_scope, clean_key)
    if val and isinstance(val, dict) and "response" in val:
        logger.info(f"Idempotency hit for {kv_scope}/{clean_key}")
        return {"cached": True, "response": val["response"]}

    return {"cached": False}
