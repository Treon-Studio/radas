"""Notification service for dispatching Slack/Discord and webhook alerts on events (UC251 / UC349).

Handles execution failure, drift detection, and deployment alert notifications.
Supports Slack webhooks, Discord webhooks (converting standard payload format),
and internal user notification preferences.
"""
from __future__ import annotations

import logging
import threading
from typing import Any, Dict, Optional

import requests

from services.notif_prefs import get_prefs
from services.webhook_dispatcher import dispatch_event

logger = logging.getLogger(__name__)


def format_failure_message(execution: Dict[str, Any], project_id: str, error_detail: str = "") -> str:
    exec_id = execution.get("id") or "unknown"
    run_params = execution.get("runParams") or {}
    exec_type = run_params.get("execution_type") or "RUN"
    stack = run_params.get("stack_name") or run_params.get("playbook") or "default"
    action = run_params.get("tofu_action") or run_params.get("action") or "apply"
    
    msg = f":rotating_light: *Execution Failed on Radas*\n"
    msg += f"• *Project:* `{project_id}`\n"
    msg += f"• *Target:* `{stack}` ({exec_type} / {action})\n"
    msg += f"• *Execution ID:* `{exec_id}`\n"
    if error_detail:
        msg += f"• *Error:* ```{error_detail[:500]}```\n"
    return msg


def _send_webhook_http(url: str, text: str, title: str = "Radas Alert") -> bool:
    try:
        # Discord webhooks support "content" field, Slack webhooks support "text"
        # Providing both works across Slack, Discord, and Mattermost
        payload = {
            "text": text,
            "content": text,
            "username": "Radas Alerts",
        }
        resp = requests.post(url, json=payload, timeout=8)
        return 200 <= resp.status_code < 300
    except Exception as e:
        logger.warning(f"[notification_service] webhook delivery failed for {url}: {e}")
        return False


def notify_execution_failure(
    execution: Dict[str, Any],
    project_id: str,
    error_detail: str = "",
    webhook_url: Optional[str] = None,
) -> None:
    """Send failure notification asynchronously via configured channels."""
    text = format_failure_message(execution, project_id, error_detail)

    def _deliver():
        # 1. Direct webhook URL if specified
        if webhook_url:
            _send_webhook_http(webhook_url, text)

        # 2. Trigger user's preferred webhook if triggeredByUserId is present
        user_id = execution.get("triggeredByUserId")
        if user_id:
            try:
                prefs = get_prefs(user_id)
                user_hook = str(prefs.get("slack_webhook") or "").strip()
                if user_hook and user_hook != webhook_url:
                    _send_webhook_http(user_hook, text)
            except Exception as e:
                logger.warning(f"[notification_service] failed getting user prefs: {e}")

        # 3. Dispatch outbound webhook event
        try:
            dispatch_event("execution.failed", {
                "execution_id": execution.get("id"),
                "project_id": project_id,
                "status": "FAILED",
                "run_params": execution.get("runParams") or {},
                "error": error_detail,
            })
        except Exception as e:
            logger.warning(f"[notification_service] failed dispatching webhook event: {e}")

    threading.Thread(target=_deliver, daemon=True).start()
