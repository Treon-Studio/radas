"""OpenTofu / Terraform init skip optimizer (UC530)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

INIT_CACHE_SCOPE = "init_cache"


def should_skip_init(project_id: str, stack: str, current_config_hash: str) -> bool:
    """Check if tofu init can be safely skipped based on cached successful init hash (UC530)."""
    key = f"{project_id.strip()}/{stack.strip()}"
    cached = kv_get(INIT_CACHE_SCOPE, key)

    if cached and isinstance(cached, dict):
        last_hash = cached.get("config_hash")
        if last_hash and last_hash == current_config_hash:
            logger.info(f"Skipping redundant init for {key} (hash match: {current_config_hash[:8]})")
            return True

    return False


def record_init_success(project_id: str, stack: str, config_hash: str) -> None:
    """Record successful tofu init execution hash in cache (UC530)."""
    key = f"{project_id.strip()}/{stack.strip()}"
    kv_set(INIT_CACHE_SCOPE, key, {
        "config_hash": config_hash,
        "recorded_at": time.time(),
    })
    logger.info(f"Recorded successful init cache for {key}")
