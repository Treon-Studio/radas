"""Tests for Execution Failure Notifications (UC251 / UC349).

Verifies payload formatting, delivery across channels, and graceful failure handling.
"""
from __future__ import annotations

import time
import pytest

from services import notification_service


def test_format_failure_message():
    execution = {
        "id": "run-fail-123",
        "runParams": {
            "execution_type": "TOFU_RUN",
            "stack_name": "network-prod",
            "tofu_action": "apply",
        }
    }
    msg = notification_service.format_failure_message(execution, "proj-1", "Resource timeout")
    assert "network-prod" in msg
    assert "run-fail-123" in msg
    assert "Resource timeout" in msg
    assert "proj-1" in msg


def test_notify_execution_failure_dispatches_webhooks(monkeypatch):
    sent_requests = []
    dispatched_events = []

    def mock_post(url, json=None, timeout=None):
        sent_requests.append({"url": url, "json": json})
        class Resp:
            status_code = 200
        return Resp()

    def mock_dispatch(event, payload):
        dispatched_events.append({"event": event, "payload": payload})
        return 1

    monkeypatch.setattr("requests.post", mock_post)
    monkeypatch.setattr("services.notification_service.dispatch_event", mock_dispatch)

    execution = {
        "id": "run-999",
        "runParams": {"stack_name": "db", "execution_type": "TOFU_RUN", "tofu_action": "apply"},
        "triggeredByUserId": "user-bob",
    }

    notification_service.notify_execution_failure(
        execution,
        project_id="proj-alpha",
        error_detail="Exit code 1",
        webhook_url="https://hooks.slack.com/services/test",
    )

    # Wait for daemon thread
    time.sleep(0.2)

    assert len(sent_requests) >= 1
    assert sent_requests[0]["url"] == "https://hooks.slack.com/services/test"
    assert "proj-alpha" in sent_requests[0]["json"]["text"]

    assert len(dispatched_events) == 1
    assert dispatched_events[0]["event"] == "execution.failed"
    assert dispatched_events[0]["payload"]["execution_id"] == "run-999"
