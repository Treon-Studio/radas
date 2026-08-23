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


def test_ip_allowlist_enforcement(pg_db):
    from services.ip_allowlist import set_org_ip_allowlist, is_ip_allowed

    # 1. Unconfigured org allows all IPs
    assert is_ip_allowed("198.51.100.25", org_id="org-open") is True

    # 2. Configure IP CIDRs for corporate VPN
    set_org_ip_allowlist("org-corp", ["203.0.113.0/24", "10.0.0.0/8"])

    # 3. Verify IP matching
    assert is_ip_allowed("203.0.113.45", org_id="org-corp") is True
    assert is_ip_allowed("10.50.1.2", org_id="org-corp") is True
    assert is_ip_allowed("198.51.100.25", org_id="org-corp") is False


def test_session_inactivity_lock(pg_db):
    from services.session_inactivity import (
        record_session_activity,
        is_session_inactive,
    )
    import time

    token = "sess-token-xyz-123"

    # 1. Record fresh activity
    record_session_activity(token, user_id="u-alice")
    assert is_session_inactive(token, max_idle_seconds=60) is False

    # 2. Check with 0s threshold to verify timeout detection
    time.sleep(0.02)
    assert is_session_inactive(token, max_idle_seconds=0.01) is True


def test_daily_failure_and_drift_digest(pg_db):
    from services.daily_digest import compile_daily_digest
    from services.audit_events import record_audit_event

    record_audit_event("cloud.run.failed", target_type="stack", target_id="auth-service", meta={"project_id": "p-digest", "error": "Crash"})
    record_audit_event("drift.detected", target_type="stack", target_id="billing-db", meta={"project_id": "p-digest", "drift_count": 2})

    digest = compile_daily_digest(project_id="p-digest", hours=24)
    assert digest["project_id"] == "p-digest"
    assert digest["failed_runs_count"] >= 1
    assert digest["drift_events_count"] >= 1
    assert "Daily Infrastructure Digest" in digest["summary_title"]


def test_semver_constraint_resolver():
    from services.semver_resolver import resolve_semver_constraint

    available = ["1.0.0", "1.1.0", "1.2.0", "1.2.5", "1.3.0", "2.0.0", "2.1.0"]

    # 1. Exact match
    assert resolve_semver_constraint(available, "1.2.0") == "1.2.0"

    # 2. Caret constraint (^1.2.0 -> highest 1.x >= 1.2.0 -> 1.3.0)
    assert resolve_semver_constraint(available, "^1.2.0") == "1.3.0"

    # 3. Tilde constraint (~> 1.2.0 -> highest 1.2.x -> 1.2.5)
    assert resolve_semver_constraint(available, "~> 1.2.0") == "1.2.5"

    # 4. Comparison constraint
    assert resolve_semver_constraint(available, ">= 2.0.0") == "2.1.0"
    assert resolve_semver_constraint(available, "< 1.2.0") == "1.1.0"


