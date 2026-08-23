"""Statistical cost anomaly detection service (UC412)."""
from __future__ import annotations

import json
import logging
import math
from typing import Any, Dict, List

from storage import pg

logger = logging.getLogger(__name__)


def detect_cost_anomalies(project_id: str, threshold_std_dev: float = 1.5) -> List[Dict[str, Any]]:
    """Detect stacks with abnormal cloud infrastructure costs compared to project distribution (UC412)."""
    rows = pg.query_all(
        "SELECT stack, data FROM stack_meta WHERE project_id = %s",
        (project_id,),
    )

    if len(rows) < 2:
        return []

    stacks_costs = []
    for r in rows:
        meta = r.get("data") or {}
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}
        cost = float(meta.get("monthly_cost") or meta.get("estimated_monthly_cost") or 0.0)
        stacks_costs.append((r["stack"], cost, meta))

    costs = [c[1] for c in stacks_costs]
    mean_cost = sum(costs) / len(costs)
    variance = sum((x - mean_cost) ** 2 for x in costs) / len(costs)
    std_dev = math.sqrt(variance)

    anomalies: List[Dict[str, Any]] = []
    for stack, cost, meta in stacks_costs:
        if std_dev > 0 and (cost - mean_cost) > (threshold_std_dev * std_dev):
            z_score = (cost - mean_cost) / std_dev
            severity = "critical" if z_score > 3.0 or cost > 500 else "high"
            anomalies.append({
                "stack": stack,
                "monthly_cost": cost,
                "project_mean_cost": round(mean_cost, 2),
                "z_score": round(z_score, 2),
                "severity": severity,
                "explanation": f"Stack cost ${cost:.2f} is significantly higher than project average (${mean_cost:.2f}).",
            })

    return anomalies
