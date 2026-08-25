"""Infrastructure state snapshot retention policy enforcer (UC542)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def enforce_snapshot_retention(
    snapshots: List[Dict[str, Any]],
    max_retention_count: int = 10,
) -> Dict[str, Any]:
    """Prune older snapshots to maintain maximum allowed snapshot retention quota (UC542)."""
    if not snapshots:
        return {
            "retained_snapshots": [],
            "pruned_snapshots": [],
            "pruned_count": 0,
        }

    sorted_snaps = sorted(
        snapshots,
        key=lambda x: float(x.get("timestamp") or x.get("created_at") or 0.0),
        reverse=True,
    )

    retained = sorted_snaps[:max_retention_count]
    pruned = sorted_snaps[max_retention_count:]

    logger.info(
        f"Snapshot retention evaluated: {len(retained)} retained, {len(pruned)} pruned (max={max_retention_count})"
    )

    return {
        "retained_snapshots": retained,
        "pruned_snapshots": pruned,
        "pruned_count": len(pruned),
    }
