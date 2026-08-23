"""Multidimensional cost analytics by tag, provider, or VCS branch (UC358)."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict

from storage import pg

logger = logging.getLogger(__name__)


def get_cost_analytics_by_dimension(project_id: str, dimension: str) -> Dict[str, Any]:
    """Aggregate project stack costs broken down by a specific slice / dimension (UC358)."""
    rows = pg.query_all(
        "SELECT stack, data FROM stack_meta WHERE project_id = %s",
        (project_id,),
    )

    breakdown: Dict[str, float] = {}
    total = 0.0

    is_tag = dimension.startswith("tag:")
    tag_key = dimension[4:] if is_tag else None

    for r in rows:
        meta = r.get("data") or {}
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}

        cost = float(meta.get("monthly_cost") or meta.get("estimated_monthly_cost") or 0.0)
        total += cost

        if is_tag and tag_key:
            tags = meta.get("tags") or {}
            dim_val = str(tags.get(tag_key) or "untagged")
        elif dimension == "branch":
            dim_val = str(meta.get("branch") or "unspecified")
        elif dimension == "provider":
            dim_val = str(meta.get("provider") or "generic")
        else:
            dim_val = str(meta.get(dimension) or "other")

        breakdown[dim_val] = round(breakdown.get(dim_val, 0.0) + cost, 2)

    return {
        "project_id": project_id,
        "dimension": dimension,
        "breakdown": breakdown,
        "total": round(total, 2),
    }
