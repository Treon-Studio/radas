import json
import pytest
from pathlib import Path


def test_webhook_dispatcher_with_dlq(pg_db):
    from services.webhook_dispatcher import (
        dispatch_webhook_with_dlq,
        list_webhook_dlq,
        clear_webhook_dlq,
    )

    # 1. Simulate failing webhook sender
    def failing_sender(url, data):
        raise ConnectionRefusedError("Target server offline")

    res = dispatch_webhook_with_dlq(
        target_url="https://api.example.com/webhooks",
        event_type="stack.applied",
        payload={"stack": "prod-db", "status": "success"},
        max_retries=2,
        sender_fn=failing_sender,
    )
    assert res["status"] == "dlq"
    assert res["retries_attempted"] == 2
    assert "dlq_id" in res

    # 2. Verify DLQ contains the event
    dlq_items = list_webhook_dlq()
    assert len(dlq_items) >= 1
    assert any(item["event_type"] == "stack.applied" for item in dlq_items)

    # 3. Clear item
    clear_webhook_dlq(res["dlq_id"])
    assert not any(item.get("id") == res["dlq_id"] for item in list_webhook_dlq())


def test_execution_failure_dlq(pg_db):
    from services.execution_dlq import (
        push_execution_to_dlq,
        list_execution_dlq,
        redrive_execution_dlq,
    )

    # 1. Push failed execution to DLQ
    entry = push_execution_to_dlq(
        execution_id="exec-fail-123",
        stack="payment-api",
        project_id="p-fintech",
        error_message="Fatal crash: OpenTofu lock acquisition timed out",
        run_metadata={"attempts": 3, "worker": "worker-eu-1"},
    )
    assert entry["id"]
    assert entry["status"] == "queued_in_dlq"
    assert entry["stack"] == "payment-api"

    # 2. List DLQ executions
    dlq_list = list_execution_dlq(project_id="p-fintech")
    assert len(dlq_list) >= 1
    assert dlq_list[0]["execution_id"] == "exec-fail-123"

    # 3. Redrive execution from DLQ
    redrive_res = redrive_execution_dlq(entry["id"])
    assert redrive_res["success"] is True
    assert redrive_res["status"] == "redriven"
