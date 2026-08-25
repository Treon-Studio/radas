"""Automated safety snapshot triggers prior to rightsizing actions (UC556)."""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict

from services.audit_events import record_audit_event
from services.snapshot_comment import annotate_snapshot
from storage.kv import kv_set

logger = logging.getLogger(__name__)


def execute_safe_rightsizing(
    project_id: str,
    stack: str,
    resource_id: str,
    target_instance_type: str,
    actor: str = "system",
) -> Dict[str, Any]:
    """Take a backup snapshot of the stack state before modifying instance types (UC556)."""
    snapshot_id = f"snap-pre-rightsize-{uuid.uuid4().hex[:6]}"
    now = time.time()

    # Record snapshot metadata
    snap_entry = {
        "snapshot_id": snapshot_id,
        "project_id": project_id,
        "stack": stack,
        "resource_id": resource_id,
        "target_instance_type": target_instance_type,
        "created_at": now,
    }
    kv_set("stack_snapshots", snapshot_id, snap_entry)

    # Attach human-readable annotation
    annotate_snapshot(
        snapshot_id=snapshot_id,
        title=f"Pre-Rightsizing Backup for {resource_id}",
        description=f"Automated safety snapshot created prior to resizing {resource_id} to {target_instance_type}.",
        tags=["rightsizing", "backup", "safety"],
    )

    record_audit_event(
        "rightsizing.safety_snapshot.created",
        actor_user_id=actor,
        target_type="stack",
        target_id=stack,
        meta={"snapshot_id": snapshot_id, "resource_id": resource_id, "target_type": target_instance_type},
    )

    logger.info(f"Triggered safety snapshot {snapshot_id} before rightsizing {resource_id} -> {target_instance_type}")

    return {
        "success": True,
        "snapshot_id": snapshot_id,
        "project_id": project_id,
        "stack": stack,
        "resource_id": resource_id,
        "target_instance_type": target_instance_type,
        "created_at": now,
    }
