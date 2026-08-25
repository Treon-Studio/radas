"""Preview environment to production promotion workflow with approval gates (UC502)."""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, Optional

from services.audit_events import record_audit_event
from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

PROMOTION_SCOPE = "preview_promotions"


def request_preview_promotion(
    project_id: str,
    preview_stack: str,
    prod_stack: str,
    author: str,
) -> Dict[str, Any]:
    """Create a request to promote a preview stack configuration to production (UC502)."""
    promo_id = f"promo-{uuid.uuid4().hex[:8]}"
    entry = {
        "id": promo_id,
        "project_id": project_id,
        "preview_stack": preview_stack,
        "prod_stack": prod_stack,
        "author": author,
        "status": "pending_approval",
        "requested_at": time.time(),
        "promoted_at": None,
        "approved_by": None,
    }
    kv_set(PROMOTION_SCOPE, promo_id, entry)
    record_audit_event(
        "preview.promotion.requested",
        actor_user_id=author,
        target_type="stack",
        target_id=prod_stack,
        meta={"preview_stack": preview_stack, "promotion_id": promo_id},
    )
    logger.info(f"Created preview promotion request {promo_id} from {preview_stack} -> {prod_stack}")
    return entry


def get_preview_promotion(promotion_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve preview promotion details."""
    val = kv_get(PROMOTION_SCOPE, promotion_id)
    return dict(val) if isinstance(val, dict) else None


def approve_preview_promotion(promotion_id: str, approver: str) -> Dict[str, Any]:
    """Approve preview promotion and authorize production configuration deployment (UC502)."""
    promo = get_preview_promotion(promotion_id)
    if not promo:
        raise ValueError(f"Preview promotion '{promotion_id}' not found")

    promo["status"] = "approved"
    promo["approved_by"] = approver
    promo["promoted_at"] = time.time()
    kv_set(PROMOTION_SCOPE, promotion_id, promo)

    record_audit_event(
        "preview.promotion.approved",
        actor_user_id=approver,
        target_type="stack",
        target_id=promo.get("prod_stack", ""),
        meta={"promotion_id": promotion_id, "approved_by": approver},
    )
    logger.info(f"Approved preview promotion {promotion_id} by {approver}")
    return promo
