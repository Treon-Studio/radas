"""Inbound Slack interactive buttons and approval callback handler (UC617)."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from services.approval_service import approve_approval, reject_approval

logger = logging.getLogger(__name__)


def handle_slack_interaction(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Process incoming Slack block action interactions (e.g. approve/reject buttons) (UC617)."""
    user_info = payload.get("user") or {}
    username = user_info.get("username") or user_info.get("name") or user_info.get("id", "slack_user")

    actions = payload.get("actions", [])
    if not actions:
        return {"success": False, "text": "No interactive action specified."}

    action_entry = actions[0]
    action_id = action_entry.get("action_id", "")
    apr_id = action_entry.get("value", "")

    if not apr_id:
        return {"success": False, "text": "Missing approval target ID."}

    if "approve" in action_id.lower():
        approve_approval(apr_id, decided_by=username, note="Approved via Slack interactive button")
        msg = f"Approval {apr_id} approved by {username}."
        logger.info(msg)
        return {
            "success": True,
            "text": msg,
            "approval_id": apr_id,
            "action": "approved",
        }
    elif "reject" in action_id.lower():
        reject_approval(apr_id, decided_by=username, reason="Rejected via Slack interactive button")
        msg = f"Approval {apr_id} rejected by {username}."
        logger.info(msg)
        return {
            "success": True,
            "text": msg,
            "approval_id": apr_id,
            "action": "rejected",
        }

    return {"success": False, "text": f"Unrecognized Slack action: {action_id}"}
