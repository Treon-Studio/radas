"""Pipeline and playbook execution run cost attribution engine (UC557)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

RUN_ATTRIBUTION_SCOPE = "run_cost_attributions"


def attribute_execution_run_cost(
    execution_id: str,
    duration_seconds: float,
    rate_per_second: float = 0.005,
    project_id: Optional[str] = None,
    stack: Optional[str] = None,
) -> Dict[str, Any]:
    """Calculate and attribute execution run compute costs based on wall-clock execution duration (UC557)."""
    clean_id = execution_id.strip()
    compute_cost = float(duration_seconds) * float(rate_per_second)

    entry = {
        "execution_id": clean_id,
        "duration_seconds": float(duration_seconds),
        "rate_per_second": float(rate_per_second),
        "compute_cost": round(compute_cost, 4),
        "project_id": project_id,
        "stack": stack,
        "attributed_at": time.time(),
    }
    kv_set(RUN_ATTRIBUTION_SCOPE, clean_id, entry)
    logger.info(f"Attributed cost for execution {clean_id}: ${compute_cost:.4f} ({duration_seconds}s)")
    return entry


def get_run_cost_attribution(execution_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve cost attribution for a run."""
    val = kv_get(RUN_ATTRIBUTION_SCOPE, execution_id.strip())
    return dict(val) if isinstance(val, dict) else None
