"""Air-gapped and offline mode plugin cache & provider mirror configurator (UC516)."""
from __future__ import annotations

import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


def configure_offline_init_env(
    plugin_cache_dir: str,
    mirror_dir: Optional[str] = None,
) -> Dict[str, str]:
    """Configure environment variables for air-gapped / offline OpenTofu runs (UC516)."""
    env_vars: Dict[str, str] = {
        "TF_PLUGIN_CACHE_DIR": plugin_cache_dir.strip(),
        "TF_PLUGIN_CACHE_MAY_BREAK_DEPENDENCY_LOCK_FILE": "1",
    }
    if mirror_dir:
        env_vars["RADAS_PROVIDER_MIRROR_DIR"] = mirror_dir.strip()

    logger.info(f"Configured offline init env: cache={plugin_cache_dir}, mirror={mirror_dir}")
    return env_vars
