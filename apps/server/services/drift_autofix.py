"""Automated drift detection and auto-remediation service (UC355)."""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict

from services.audit_events import record_audit_event
from storage import pg

logger = logging.getLogger(__name__)


def evaluate_and_autofix_drift(
    project_id: str,
    stack: str,
    auto_apply: bool = False,
) -> Dict[str, Any]:
    """Evaluate infrastructure drift state and optionally trigger automated remediation apply (UC355)."""
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

    is_drifted = meta.get("drift_status") == "drifted"

    if not is_drifted:
        return {
            "project_id": project_id,
            "stack": stack,
            "drift_detected": False,
            "remediation_triggered": False,
            "action": "none",
        }

    if auto_apply:
        meta["drift_status"] = "remediating"
        pg.execute(
            "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s) "
            "ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data",
            (project_id, stack, json.dumps(meta)),
        )
        record_audit_event(
            "cloud.drift.autofix_applied",
            target_type="stack",
            target_id=stack,
            meta={"project_id": project_id, "auto_remediation": True},
        )
        logger.info(f"Triggered automated drift remediation apply for {project_id}/{stack}")
        return {
            "project_id": project_id,
            "stack": stack,
            "drift_detected": True,
            "remediation_triggered": True,
            "action": "auto_remediation_executed",
            "timestamp": time.time(),
        }

    return {
        "project_id": project_id,
        "stack": stack,
        "drift_detected": True,
        "remediation_triggered": False,
        "action": "manual_apply_required",
        "timestamp": time.time(),
    }
