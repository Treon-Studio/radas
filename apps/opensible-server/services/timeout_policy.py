"""Configurable client and execution timeout policy service (UC643)."""
from __future__ import annotations

import logging
from typing import Dict, Optional

from storage.kv import kv_delete, kv_get, kv_list, kv_set

logger = logging.getLogger(__name__)

KV_SCOPE = "timeout_policy"


def get_timeout_policy(scope: str, default_seconds: int = 300) -> int:
    """Get the configured timeout in seconds for a specific scope or operation."""
    val = kv_get(KV_SCOPE, scope)
    if val is not None and isinstance(val, (int, float)):
        return int(val)
    global_default = kv_get(KV_SCOPE, "default")
    if global_default is not None and isinstance(global_default, (int, float)):
        return int(global_default)
    return int(default_seconds)


def set_timeout_policy(scope: str, timeout_seconds: int) -> None:
    """Configure the timeout in seconds for a scope."""
    timeout = max(1, int(timeout_seconds))
    kv_set(KV_SCOPE, scope, timeout)
    logger.info(f"Updated timeout policy for scope '{scope}' to {timeout}s")


def list_timeout_policies() -> Dict[str, int]:
    """List all configured timeout policies."""
    records = kv_list(KV_SCOPE)
    return {rec["key"]: int(rec["value"]) for rec in records if isinstance(rec.get("value"), (int, float))}


def delete_timeout_policy(scope: str) -> bool:
    """Remove a configured timeout policy for a scope."""
    return kv_delete(KV_SCOPE, scope)
