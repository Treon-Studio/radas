"""Hierarchical organization budget rollup and spend analyzer (UC553)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def rollup_org_budgets(
    org_id: str,
    child_projects: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Rollup child project allocated budgets and actual cloud spend to the parent organization (UC553)."""
    total_budget = 0.0
    total_spend = 0.0
    over_budget_projects: List[Dict[str, Any]] = []

    for proj in child_projects:
        b = float(proj.get("budget") or 0.0)
        s = float(proj.get("actual_spend") or 0.0)
        p_id = str(proj.get("project_id") or "")

        total_budget += b
        total_spend += s

        if s > b > 0.0:
            overage = s - b
            pct = (s / b) * 100.0
            over_budget_projects.append({
                "project_id": p_id,
                "budget": b,
                "actual_spend": s,
                "overage": round(overage, 2),
                "utilization_percent": round(pct, 1),
            })

    utilization_pct = (total_spend / total_budget * 100.0) if total_budget > 0 else 0.0

    logger.info(
        f"Budget rollup for {org_id}: Budget=${total_budget:.2f}, Spend=${total_spend:.2f} ({utilization_pct:.1f}%)"
    )

    return {
        "org_id": org_id,
        "total_budget": round(total_budget, 2),
        "total_spend": round(total_spend, 2),
        "utilization_percent": round(utilization_pct, 1),
        "over_budget_projects": over_budget_projects,
        "project_count": len(child_projects),
    }
