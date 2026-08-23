"""Execution Dead-Letter Queue (DLQ) manager (UC410)."""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from storage.kv import kv_delete, kv_get, kv_list, kv_set

logger = logging.getLogger(__name__)

EXEC_DLQ_SCOPE = "execution_dlq"


def push_execution_to_dlq(
    execution_id: str,
    stack: str,
    project_id: str,
    error_message: str,
    run_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Store terminal execution failure into the dead-letter queue (UC410)."""
    dlq_id = str(uuid.uuid4())
    entry = {
        "id": dlq_id,
        "execution_id": execution_id,
        "stack": stack,
        "project_id": project_id,
        "error_message": error_message,
        "metadata": run_metadata or {},
        "status": "queued_in_dlq",
        "created_at": time.time(),
    }
    kv_set(EXEC_DLQ_SCOPE, dlq_id, entry)
    logger.warning(f"Execution {execution_id} on stack {stack} routed to DLQ ({dlq_id}): {error_message}")
    return entry


def list_execution_dlq(project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """List execution dead-letter queue records."""
    records = kv_list(EXEC_DLQ_SCOPE)
    items: List[Dict[str, Any]] = []
    for r in records:
        val = r.get("value")
        if isinstance(val, dict):
            if project_id and val.get("project_id") != project_id:
                continue
            items.append(val)
    items.sort(key=lambda x: x.get("created_at") or 0, reverse=True)
    return items


def redrive_execution_dlq(dlq_id: str) -> Dict[str, Any]:
    """Redrive a dead-lettered execution back into the execution queue (UC410)."""
    entry = kv_get(EXEC_DLQ_SCOPE, dlq_id)
    if not entry or not isinstance(entry, dict):
        raise ValueError(f"DLQ entry '{dlq_id}' not found")

    entry["status"] = "redriven"
    entry["redriven_at"] = time.time()
    kv_set(EXEC_DLQ_SCOPE, dlq_id, entry)

    logger.info(f"Redriven execution {entry.get('execution_id')} from DLQ {dlq_id}")
    return {
        "success": True,
        "status": "redriven",
        "dlq_id": dlq_id,
        "execution_id": entry.get("execution_id"),
    }
