"""Bill spike protection and automated safeguard triggers (UC554)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

BASELINE_SCOPE = "project_cost_baseline"


def set_project_cost_baseline(project_id: str, baseline_monthly_cost: float) -> None:
    """Set the historical cost baseline for a project (UC554)."""
    kv_set(BASELINE_SCOPE, project_id, {
        "baseline": float(baseline_monthly_cost),
        "updated_at": time.time(),
    })


def get_project_cost_baseline(project_id: str) -> float:
    """Retrieve historical cost baseline for a project."""
    data = kv_get(BASELINE_SCOPE, project_id)
    if data and isinstance(data, dict):
        return float(data.get("baseline", 0.0))
    return 0.0


def check_bill_spike(
    project_id: str,
    current_projected_cost: float,
    threshold_percentage: float = 50.0,
) -> Dict[str, Any]:
    """Evaluate whether current projected cost exceeds baseline by more than threshold percentage (UC554)."""
    baseline = get_project_cost_baseline(project_id)
    current = float(current_projected_cost)

    if baseline <= 0:
        return {
            "project_id": project_id,
            "spike_detected": False,
            "baseline": baseline,
            "current": current,
            "increase_percentage": 0.0,
        }

    increase = ((current - baseline) / baseline) * 100.0
    spike = increase > threshold_percentage

    res = {
        "project_id": project_id,
        "spike_detected": spike,
        "baseline": baseline,
        "current": current,
        "increase_percentage": round(increase, 2),
        "threshold_percentage": threshold_percentage,
    }

    if spike:
        res["action"] = "alert_or_auto_stop"
        logger.warning(
            f"Bill spike detected for project {project_id}: baseline ${baseline} -> current ${current} (+{increase:.1f}%)"
        )

    return res
