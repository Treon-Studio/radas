"""Multi-stack cost trend line chart overlay series generator (UC561)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def generate_multi_stack_cost_overlay(
    stack_histories: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    """Align time-series historical cost data across multiple stacks for comparative overlay visualization (UC561)."""
    all_timestamps_set = set()
    stacks = list(stack_histories.keys())

    for stack_name, points in stack_histories.items():
        for p in points:
            ts = p.get("date") or p.get("timestamp")
            if ts:
                all_timestamps_set.add(str(ts))

    sorted_timestamps = sorted(list(all_timestamps_set))
    series: Dict[str, List[float]] = {stk: [] for stk in stacks}

    for stk in stacks:
        points = stack_histories[stk]
        points_map = {str(p.get("date") or p.get("timestamp")): float(p.get("cost", 0.0)) for p in points}
        for ts in sorted_timestamps:
            series[stk].append(round(points_map.get(ts, 0.0), 2))

    logger.info(f"Generated cost trend overlay for {len(stacks)} stacks across {len(sorted_timestamps)} time points")

    return {
        "stacks": stacks,
        "timestamps": sorted_timestamps,
        "series": series,
    }
