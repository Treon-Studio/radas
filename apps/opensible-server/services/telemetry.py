"""Anonymized system telemetry collection and opt-in manager (UC604)."""
from __future__ import annotations

import hashlib
import logging
import platform
import sys
from typing import Any, Dict

from storage.kv import kv_get, kv_set
from storage import pg

logger = logging.getLogger(__name__)

KV_SCOPE = "system_settings"
OPT_IN_KEY = "telemetry_opt_in"


def set_telemetry_opt_in(enabled: bool) -> None:
    """Configure telemetry opt-in flag (UC604)."""
    kv_set(KV_SCOPE, OPT_IN_KEY, bool(enabled))
    logger.info(f"Telemetry opt-in status updated to: {enabled}")


def is_telemetry_opted_in() -> bool:
    """Check if the user has opted in to anonymous telemetry."""
    val = kv_get(KV_SCOPE, OPT_IN_KEY)
    return bool(val) if val is not None else False


def _get_stack_bucket(count: int) -> str:
    if count == 0:
        return "0"
    if count <= 5:
        return "1-5"
    if count <= 20:
        return "6-20"
    if count <= 100:
        return "21-100"
    return "100+"


def get_telemetry_payload(anonymize: bool = True) -> Dict[str, Any]:
    """Generate anonymized telemetry payload for product improvement (UC604)."""
    total_stacks_res = pg.query_one("SELECT COUNT(*) as count FROM stack_meta")
    count = total_stacks_res.get("count", 0) if total_stacks_res else 0

    instance_id = platform.node() or "default-node"
    instance_hash = hashlib.sha256(instance_id.encode("utf-8")).hexdigest()[:16]

    return {
        "os": platform.system().lower(),
        "arch": platform.machine().lower(),
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}",
        "stack_count_bucket": _get_stack_bucket(count),
        "instance_hash": instance_hash,
        "opt_in": is_telemetry_opted_in(),
    }
