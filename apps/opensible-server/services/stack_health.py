"""Stack composite health score calculator (UC427)."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from storage import pg

logger = logging.getLogger(__name__)


def calculate_stack_health_score(project_id: str, stack: str) -> Dict[str, Any]:
    """Calculate composite stack health score (0-100) based on drift, execution history, and test cases (UC427)."""
    row = pg.query_one(
        "SELECT data FROM stack_meta WHERE project_id = %s AND stack = %s",
        (project_id, stack),
    )
    meta = row.get("data") or {} if row else {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}

    score = 100
    deductions: List[Dict[str, Any]] = []

    # 1. Drift check
    drift = meta.get("drift_status", "clean")
    if drift == "drifted":
        score -= 25
        deductions.append({"factor": "drift_detected", "points": -25, "message": "Infrastructure drift detected"})

    # 2. Last run status
    last_status = meta.get("last_run_status") or meta.get("status", "unknown")
    if last_status in ("failed", "error"):
        score -= 30
        deductions.append({"factor": "last_run_failed", "points": -30, "message": "Last execution run failed"})

    # 3. Test failure check
    if meta.get("failing_tests", 0) > 0:
        pts = min(20, meta.get("failing_tests", 0) * 5)
        score -= pts
        deductions.append({"factor": "failing_tests", "points": -pts, "message": f"{meta.get('failing_tests')} tests failing"})

    score = max(0, min(100, score))

    if score >= 80:
        health_status = "healthy"
    elif score >= 50:
        health_status = "warning"
    else:
        health_status = "critical"

    return {
        "project_id": project_id,
        "stack": stack,
        "health_score": score,
        "status": health_status,
        "deductions": deductions,
    }
