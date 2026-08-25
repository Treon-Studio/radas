"""Soft and hard quota policy evaluation engine (UC548)."""
from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


def evaluate_quota(
    current_usage: int,
    limit: int,
    soft_threshold_percent: float = 80.0,
) -> Dict[str, Any]:
    """Evaluate resource consumption against limits to identify soft warnings and hard quota blocks (UC548)."""
    if limit <= 0:
        return {
            "allowed": True,
            "warning": False,
            "hard_blocked": False,
            "current_usage": current_usage,
            "limit": limit,
            "usage_percent": 0.0,
        }

    pct = (current_usage / limit) * 100.0

    if pct >= 100.0:
        logger.warning(f"Hard quota block triggered: {current_usage}/{limit} ({pct:.1f}%)")
        return {
            "allowed": False,
            "warning": True,
            "hard_blocked": True,
            "current_usage": current_usage,
            "limit": limit,
            "usage_percent": round(pct, 1),
            "message": f"Hard quota limit exceeded: {current_usage}/{limit} consumed",
        }

    if pct >= soft_threshold_percent:
        logger.info(f"Soft quota warning: {current_usage}/{limit} ({pct:.1f}%)")
        return {
            "allowed": True,
            "warning": True,
            "hard_blocked": False,
            "current_usage": current_usage,
            "limit": limit,
            "usage_percent": round(pct, 1),
            "message": f"Soft quota warning: {pct:.1f}% consumed (threshold: {soft_threshold_percent}%)",
        }

    return {
        "allowed": True,
        "warning": False,
        "hard_blocked": False,
        "current_usage": current_usage,
        "limit": limit,
        "usage_percent": round(pct, 1),
    }
