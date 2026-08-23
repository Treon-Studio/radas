"""OpenTofu execution milestone run timeline generator (UC529)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def build_run_timeline(steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build chronological execution milestones and compute step durations (UC529)."""
    timeline: List[Dict[str, Any]] = []

    for s in steps:
        step_name = s.get("step", "step")
        status = s.get("status", "pending")
        start_time = s.get("start_time")
        end_time = s.get("end_time")

        duration = None
        if start_time is not None and end_time is not None:
            duration = round(float(end_time) - float(start_time), 2)

        timeline.append({
            "step": step_name,
            "status": status,
            "start_time": start_time,
            "end_time": end_time,
            "duration": duration,
        })

    logger.info(f"Built run timeline with {len(timeline)} steps")
    return timeline
