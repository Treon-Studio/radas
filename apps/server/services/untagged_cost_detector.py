"""Untagged cloud resource cost detector and tag policy validator (UC563)."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from storage import pg

logger = logging.getLogger(__name__)

DEFAULT_REQUIRED_TAGS = ["owner", "environment", "cost_center"]


def detect_untagged_resource_costs(
    project_id: str,
    required_tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Scan stacks for missing required metadata tags and calculate untagged spend (UC563)."""
    check_tags = required_tags if required_tags is not None else DEFAULT_REQUIRED_TAGS
    rows = pg.query_all(
        "SELECT stack, data FROM stack_meta WHERE project_id = %s",
        (project_id,),
    )

    untagged_stacks: List[Dict[str, Any]] = []
    untagged_cost_total = 0.0

    for r in rows:
        stack_name = r.get("stack")
        meta = r.get("data")
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}

        if not isinstance(meta, dict):
            meta = {}

        tags = meta.get("tags") or {}
        cost = float(meta.get("cost") or 0.0)

        missing_tags = [t for t in check_tags if not tags.get(t)]

        if missing_tags:
            untagged_cost_total += cost
            untagged_stacks.append({
                "stack": stack_name,
                "cost": cost,
                "missing_tags": missing_tags,
                "existing_tags": tags,
            })

    logger.info(
        f"Untagged cost detection for {project_id}: {len(untagged_stacks)} untagged stacks totaling ${untagged_cost_total:.2f}"
    )

    return {
        "project_id": project_id,
        "required_tags": check_tags,
        "untagged_count": len(untagged_stacks),
        "untagged_cost_total": round(untagged_cost_total, 2),
        "untagged_stacks": untagged_stacks,
    }
