"""Unmanaged cloud resource scanner and orphan detector (UC375)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def scan_unmanaged_resources(
    project_id: str,
    cloud_resources: List[Dict[str, Any]],
    managed_state_resources: List[str],
) -> Dict[str, Any]:
    """Identify cloud resources present in infrastructure but absent from OpenTofu IaC state (UC375)."""
    managed_set = {str(r).strip() for r in managed_state_resources}

    unmanaged = []
    managed = []

    for item in cloud_resources:
        res_id = str(item.get("id", "")).strip()
        res_name = str(item.get("name", "")).strip()

        if res_id in managed_set or res_name in managed_set:
            managed.append(item)
        else:
            unmanaged.append(item)

    logger.info(
        f"Scanned {len(cloud_resources)} cloud resources for {project_id}: "
        f"{len(unmanaged)} unmanaged, {len(managed)} managed"
    )

    return {
        "project_id": project_id,
        "total_cloud_resources": len(cloud_resources),
        "unmanaged_count": len(unmanaged),
        "managed_count": len(managed),
        "unmanaged_resources": unmanaged,
        "managed_resources": managed,
    }
