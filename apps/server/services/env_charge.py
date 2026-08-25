"""Environment chargeback and development free tier billing calculator (UC552)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

FREE_TIER_ENVS = {"development", "dev", "preview", "test", "sandbox"}


def calculate_env_chargeback(
    project_id: str,
    stack_costs: List[Dict[str, Any]],
    dev_free_tier: bool = True,
) -> Dict[str, Any]:
    """Calculate billing breakdown and apply free tier waiver for non-production environments (UC552)."""
    total_cost = 0.0
    billable_cost = 0.0
    free_tier_savings = 0.0
    env_breakdown: Dict[str, Dict[str, float]] = {}

    for item in stack_costs:
        cost = float(item.get("cost") or 0.0)
        env = str(item.get("env") or "unknown").lower().strip()

        total_cost += cost

        if env not in env_breakdown:
            env_breakdown[env] = {"total_cost": 0.0, "billable_cost": 0.0, "waived_cost": 0.0}

        env_breakdown[env]["total_cost"] += cost

        if dev_free_tier and env in FREE_TIER_ENVS:
            free_tier_savings += cost
            env_breakdown[env]["waived_cost"] += cost
        else:
            billable_cost += cost
            env_breakdown[env]["billable_cost"] += cost

    logger.info(
        f"Chargeback for {project_id}: Total=${total_cost:.2f}, Billable=${billable_cost:.2f}, Savings=${free_tier_savings:.2f}"
    )

    return {
        "project_id": project_id,
        "total_cost": round(total_cost, 2),
        "billable_cost": round(billable_cost, 2),
        "free_tier_savings": round(free_tier_savings, 2),
        "dev_free_tier_enabled": dev_free_tier,
        "env_breakdown": env_breakdown,
    }
