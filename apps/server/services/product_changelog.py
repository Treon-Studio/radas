"""In-console product changelog and release notes service (UC600)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

RELEASE_NOTES = [
    {
        "version": "v3.2.0",
        "released_at": "2026-08-23",
        "title": "Phase 6 Feature Flags, Multi-Org & Complete GitOps",
        "highlights": [
            "Advanced Feature Flags with kill-switch policies",
            "Multi-tenant Organization isolation and private Tofu Module registry",
            "Full-text indexing, SWR caching, and sub-second large stack pagination",
        ],
    },
    {
        "version": "v3.1.0",
        "released_at": "2026-08-15",
        "title": "Phase 5 Distributed FinOps & High-Availability Workers",
        "highlights": [
            "Real-time cost anomaly forecasting and multi-currency conversions",
            "Graceful worker queue draining and round-robin fair scheduling",
        ],
    },
]


def get_product_changelog(limit: int = 10) -> List[Dict[str, Any]]:
    """Retrieve chronologically ordered product release notes (UC600)."""
    return RELEASE_NOTES[:limit]
