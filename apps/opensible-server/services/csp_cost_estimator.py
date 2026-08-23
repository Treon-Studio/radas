"""Cloud Service Provider (CSP) instance cost estimator (UC485)."""
from __future__ import annotations

import logging
from typing import Any, Dict

from services.pricing_table_updater import get_instance_price

logger = logging.getLogger(__name__)

# Fallback default hourly rates (USD) if dynamic pricing is absent
DEFAULT_HOURLY_RATES = {
    "aws": {"t3.nano": 0.0052, "t3.micro": 0.0104, "t3.small": 0.0208, "t3.medium": 0.0416, "m5.large": 0.096},
    "gcp": {"e2-micro": 0.0084, "e2-small": 0.0168, "e2-medium": 0.0336, "n2-standard-2": 0.0971},
    "azure": {"standard_b1s": 0.0104, "standard_b2s": 0.0416, "standard_d2s_v3": 0.096},
    "bytedc": {"c1.small": 0.015, "c1.medium": 0.030, "c1.large": 0.060},
}


def estimate_csp_instance_cost(
    provider: str,
    instance_type: str,
    hours_per_month: float = 730.0,
) -> Dict[str, Any]:
    """Estimate monthly running cost for a target cloud VM instance (UC485)."""
    p = provider.lower().strip()
    itype = instance_type.strip()

    hourly = get_instance_price(p, itype)
    if hourly <= 0:
        hourly = DEFAULT_HOURLY_RATES.get(p, {}).get(itype, 0.05)

    monthly = hourly * float(hours_per_month)

    return {
        "provider": p,
        "instance_type": itype,
        "hourly_rate": round(hourly, 4),
        "hours_per_month": hours_per_month,
        "monthly_cost": round(monthly, 2),
        "currency": "USD",
    }
