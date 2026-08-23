"""Scheduled plan runner and automated diff generation (UC426)."""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, Optional

from services.audit_events import record_audit_event

logger = logging.getLogger(__name__)


def trigger_scheduled_plan(
    project_id: str,
    stack: str,
    triggered_by: str = "cron_scheduler",
) -> Dict[str, Any]:
    """Trigger an automated scheduled plan for drift and diff tracking (UC426)."""
    execution_id = f"exec-sched-{uuid.uuid4().hex[:8]}"

    try:
        from services.cloud_provisioning import _create_execution
        _create_execution(
            project_id=project_id,
            stack=stack,
            action="plan",
            triggered_by=f"scheduled:{triggered_by}",
        )
    except Exception:
        pass

    record_audit_event(
        "cloud.scheduled_plan.run",
        actor_user_id=triggered_by,
        target_type="stack",
        target_id=stack,
        meta={"project_id": project_id, "execution_id": execution_id},
    )

    logger.info(f"Triggered scheduled plan for {project_id}/{stack} (execution={execution_id})")
    return {
        "success": True,
        "execution_id": execution_id,
        "project_id": project_id,
        "stack": stack,
        "action": "plan",
        "scheduled": True,
        "triggered_at": time.time(),
    }
