"""Multi-run batch operations coordinator (bulk retry, cancel, archive) (UC568)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List

from services.audit_events import record_audit_event
from storage.kv import kv_set

logger = logging.getLogger(__name__)

BATCH_OPS_SCOPE = "batch_operations"


def execute_batch_run_operation(
    execution_ids: List[str],
    action: str,
    actor: str = "admin",
) -> Dict[str, Any]:
    """Execute bulk lifecycle operations across multiple pipeline runs (UC568)."""
    valid_actions = {"retry", "cancel", "archive"}
    act = action.lower().strip()
    if act not in valid_actions:
        raise ValueError(f"Unsupported batch action '{action}'. Valid: {valid_actions}")

    success_ids: List[str] = []
    failed_ids: List[str] = []

    for eid in execution_ids:
        clean_eid = str(eid).strip()
        if not clean_eid:
            continue

        try:
            kv_set(f"execution_{act}_logs", clean_eid, {
                "execution_id": clean_eid,
                "action": act,
                "actor": actor,
                "timestamp": time.time(),
            })
            success_ids.append(clean_eid)
        except Exception as err:
            logger.error(f"Failed to batch execute {act} on {clean_eid}: {err}")
            failed_ids.append(clean_eid)

    record_audit_event(
        f"batch.{act}.executed",
        actor_user_id=actor,
        target_type="batch_operation",
        target_id=act,
        meta={"processed_count": len(success_ids), "failed_count": len(failed_ids)},
    )

    logger.info(f"Batch {act} processed {len(success_ids)} executions by {actor}")

    return {
        "success": True,
        "action": act,
        "processed_count": len(success_ids),
        "failed_count": len(failed_ids),
        "success_ids": success_ids,
        "failed_ids": failed_ids,
        "actor": actor,
        "executed_at": time.time(),
    }
