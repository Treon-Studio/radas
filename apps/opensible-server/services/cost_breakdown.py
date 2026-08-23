"""Environment and tag-based cost breakdown aggregator (UC414)."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict

from storage import pg

logger = logging.getLogger(__name__)


def get_cost_breakdown_by_env(project_id: str) -> Dict[str, Any]:
    """Aggregate cost breakdown grouped by environment (production/staging/development) (UC414)."""
    rows = pg.query_all(
        "SELECT stack, data FROM stack_meta WHERE project_id = %s",
        (project_id,),
    )

    envs_map: Dict[str, float] = {
        "production": 0.0,
        "staging": 0.0,
        "development": 0.0,
        "preview": 0.0,
        "other": 0.0,
    }

    total_cost = 0.0

    for r in rows:
        stack_name = r.get("stack", "").lower()
        meta = r.get("data") or {}
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}

        cost = float(meta.get("monthly_cost") or meta.get("estimated_monthly_cost") or 0.0)
        total_cost += cost

        # Determine environment
        env = meta.get("env") or meta.get("environment")
        if not env:
            if "prod" in stack_name:
                env = "production"
            elif "stag" in stack_name:
                env = "staging"
            elif "dev" in stack_name:
                env = "development"
            elif "preview" in stack_name:
                env = "preview"
            else:
                env = "other"

        env = env.lower()
        if env not in envs_map:
            envs_map[env] = 0.0
        envs_map[env] += cost

    # Calculate percentages
    environments: Dict[str, Dict[str, Any]] = {}
    for env_name, env_cost in envs_map.items():
        if env_cost > 0 or env_name in ("production", "staging", "development"):
            pct = round((env_cost / total_cost * 100.0), 2) if total_cost > 0 else 0.0
            environments[env_name] = {
                "cost": round(env_cost, 2),
                "percentage": pct,
            }

    return {
        "project_id": project_id,
        "total_monthly_cost": round(total_cost, 2),
        "environments": environments,
    }
