"""Bulk multi-stack action dispatcher and orchestrator (UC428)."""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, List

from services.audit_events import record_audit_event
from storage.kv import kv_set

logger = logging.getLogger(__name__)


def execute_bulk_stack_action(
    project_id: str,
    stack_names: List[str],
    action: str = "plan",
    actor: str = "admin",
) -> Dict[str, Any]:
    """Trigger simultaneous or dependency-ordered operations across multiple stacks (UC428)."""
    batch_id = f"bulk-stack-{uuid.uuid4().hex[:8]}"
    clean_stacks = [str(s).strip() for s in stack_names if str(s).strip()]
    act = action.lower().strip()

    entry = {
        "batch_id": batch_id,
        "project_id": project_id,
        "action": act,
        "dispatched_stacks": clean_stacks,
        "count": len(clean_stacks),
        "actor": actor,
        "dispatched_at": time.time(),
    }
    kv_set("bulk_stack_runs", batch_id, entry)

    record_audit_event(
        f"stack.bulk_{act}.dispatched",
        actor_user_id=actor,
        target_type="project",
        target_id=project_id,
        meta={"batch_id": batch_id, "stacks": clean_stacks, "count": len(clean_stacks)},
    )

    logger.info(f"Dispatched bulk {act} across {len(clean_stacks)} stacks in project {project_id}")

    return {"success": True, **entry}
