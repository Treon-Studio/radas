"""Automated cloud provider pricing table synchronizer (UC558)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

PRICING_SCOPE = "provider_pricing"


def update_provider_pricing_table(
    provider: str,
    rates: Dict[str, float],
) -> Dict[str, Any]:
    """Sync and cache updated hourly rates for cloud provider instance types (UC558)."""
    clean_provider = provider.lower().strip()
    entry = {
        "provider": clean_provider,
        "rates": {k.strip(): float(v) for k, v in rates.items()},
        "rates_count": len(rates),
        "synced_at": time.time(),
    }
    kv_set(PRICING_SCOPE, clean_provider, entry)
    logger.info(f"Updated {len(rates)} pricing entries for provider {clean_provider}")
    return {"success": True, **entry}


def get_instance_price(provider: str, instance_type: str) -> float:
    """Retrieve hourly price for an instance type under a cloud provider (UC558)."""
    clean_provider = provider.lower().strip()
    data = kv_get(PRICING_SCOPE, clean_provider)
    if data and isinstance(data, dict):
        rates = data.get("rates", {})
        if instance_type.strip() in rates:
            return float(rates[instance_type.strip()])
    return 0.0
