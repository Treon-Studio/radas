"""Worker local module cache tracking and checksum registry (UC531)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)


def register_worker_cached_module(
    worker_id: str,
    module_source: str,
    version: str,
    local_path: str,
) -> Dict[str, Any]:
    """Record local filesystem cached module version on a worker node (UC531)."""
    clean_wid = worker_id.strip()
    scope = f"worker_module_cache:{clean_wid}"
    key = f"{module_source.strip()}:{version.strip()}"

    entry = {
        "worker_id": clean_wid,
        "module_source": module_source.strip(),
        "version": version.strip(),
        "local_path": local_path.strip(),
        "cached_at": time.time(),
    }
    kv_set(scope, key, entry)
    logger.info(f"Registered cached module {key} on worker {clean_wid} at {local_path}")
    return {"success": True, **entry}


def get_worker_cached_module(
    worker_id: str,
    module_source: str,
    version: str,
) -> Optional[Dict[str, Any]]:
    """Check if worker node has module version cached locally on disk (UC531)."""
    clean_wid = worker_id.strip()
    scope = f"worker_module_cache:{clean_wid}"
    key = f"{module_source.strip()}:{version.strip()}"

    data = kv_get(scope, key)
    if data and isinstance(data, dict):
        return data
    return None
