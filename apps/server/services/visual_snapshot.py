"""Component visual state and layout snapshot comparator (UC576)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def compare_visual_snapshots(
    reference_snapshot: Dict[str, Any],
    current_snapshot: Dict[str, Any],
) -> Dict[str, Any]:
    """Compare DOM/UI visual layout snapshots and report structural deviations (UC576)."""
    ref_checksum = reference_snapshot.get("checksum")
    curr_checksum = current_snapshot.get("checksum")

    diffs: List[str] = []

    if ref_checksum and curr_checksum and ref_checksum != curr_checksum:
        diffs.append(f"Checksum mismatch: {ref_checksum} != {curr_checksum}")

    ref_elements = reference_snapshot.get("elements", {})
    curr_elements = current_snapshot.get("elements", {})

    if ref_elements != curr_elements:
        diffs.append(f"Element tree attributes changed between snapshots")

    matches = len(diffs) == 0

    return {
        "match": matches,
        "diff_count": len(diffs),
        "diffs": diffs,
        "component": reference_snapshot.get("component"),
    }
