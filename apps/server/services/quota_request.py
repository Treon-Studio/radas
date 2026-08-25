"""Self-service quota increase request workflow manager (UC549)."""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, Optional

from services.audit_events import record_audit_event
from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

QUOTA_REQUEST_SCOPE = "quota_requests"


def create_quota_increase_request(
    project_id: str,
    resource_type: str,
    requested_limit: int,
    reason: str,
    author: str,
) -> Dict[str, Any]:
    """Submit a self-service request to increase resource quota limit (UC549)."""
    req_id = f"qreq-{uuid.uuid4().hex[:8]}"
    entry = {
        "id": req_id,
        "project_id": project_id,
        "resource_type": resource_type,
        "requested_limit": requested_limit,
        "reason": reason,
        "author": author,
        "status": "pending",
        "created_at": time.time(),
        "approved_by": None,
        "approved_at": None,
    }
    kv_set(QUOTA_REQUEST_SCOPE, req_id, entry)
    record_audit_event(
        "quota.increase.requested",
        actor_user_id=author,
        target_type="quota",
        target_id=resource_type,
        meta={"project_id": project_id, "requested_limit": requested_limit, "request_id": req_id},
    )
    logger.info(f"Submitted quota increase request {req_id} by {author}")
    return entry


def get_quota_request(request_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve quota increase request details."""
    val = kv_get(QUOTA_REQUEST_SCOPE, request_id)
    return dict(val) if isinstance(val, dict) else None


def approve_quota_increase(request_id: str, approver: str) -> Dict[str, Any]:
    """Approve quota increase request (UC549)."""
    req = get_quota_request(request_id)
    if not req:
        raise ValueError(f"Quota increase request '{request_id}' not found")

    req["status"] = "approved"
    req["approved_by"] = approver
    req["approved_at"] = time.time()
    kv_set(QUOTA_REQUEST_SCOPE, request_id, req)

    record_audit_event(
        "quota.increase.approved",
        actor_user_id=approver,
        target_type="quota",
        target_id=req.get("resource_type", ""),
        meta={"request_id": request_id, "approved_by": approver},
    )
    logger.info(f"Approved quota increase request {request_id} by {approver}")
    return req
