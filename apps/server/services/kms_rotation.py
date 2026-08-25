"""KMS master key rotation service (UC632)."""
from __future__ import annotations

import base64
import logging
import os
import time
from typing import Any, Dict, List, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

KV_SCOPE = "kms_keys"
ACTIVE_KEY_NAME = "active_master_key"


def rotate_kms_master_key(
    new_key_alias: str,
    new_key_bytes: Optional[bytes] = None,
) -> Dict[str, Any]:
    """Rotate the KMS master encryption key to a new version (UC632)."""
    alias = (new_key_alias or "").strip()
    if not alias:
        raise ValueError("new_key_alias is required")

    key_bytes = new_key_bytes or os.urandom(32)
    key_b64 = base64.b64encode(key_bytes).decode("utf-8")

    current_record = kv_get(KV_SCOPE, ACTIVE_KEY_NAME) or {}
    prev_version = current_record.get("version", 0)
    new_version = prev_version + 1

    history = current_record.get("previous_versions", [])
    if current_record.get("alias"):
        history.append({
            "alias": current_record["alias"],
            "version": current_record.get("version", 1),
            "rotated_out_at": time.time(),
        })

    new_record = {
        "alias": alias,
        "version": new_version,
        "key_b64": key_b64,
        "rotated_at": time.time(),
        "previous_versions": history,
    }

    kv_set(KV_SCOPE, ACTIVE_KEY_NAME, new_record)
    logger.info(f"Rotated KMS master key to version {new_version} (alias={alias})")
    return {
        "success": True,
        "active_key_alias": alias,
        "version": new_version,
        "rotated_at": new_record["rotated_at"],
    }


def get_active_kms_key() -> Dict[str, Any]:
    """Get the currently active KMS master key metadata."""
    record = kv_get(KV_SCOPE, ACTIVE_KEY_NAME)
    if not record or not isinstance(record, dict):
        return {"version": 0, "alias": "none", "previous_versions": []}
    return {
        "version": record.get("version", 0),
        "alias": record.get("alias", "none"),
        "rotated_at": record.get("rotated_at"),
        "previous_versions": record.get("previous_versions", []),
    }
