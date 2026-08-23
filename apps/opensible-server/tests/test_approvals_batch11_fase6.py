"""Tests for Enterprise Approvals, User Governance & Audit Security Fase 6 Batch 11.

UC614: Multi-party Approval Quorum Workflow.
"""
from __future__ import annotations

import time
import pytest
from services import approval_service


def test_quorum_approval_flow(data_dir):
    """UC614: Quorum approval requiring 2 signatures before reaching approved status."""
    proj = "proj-quorum"
    stk = "prod-db"

    # Create quorum approval requiring 2 approvers
    appr = approval_service.create_quorum_approval(
        stack=stk, project_id=proj, action="apply", min_approvals=2, requested_by="alice"
    )
    aid = appr["id"]
    assert appr["status"] == "pending"
    assert appr["min_approvals"] == 2
    assert approval_service.is_quorum_reached(aid) is False

    # Approver 1 signs
    res1 = approval_service.record_approval_signature(aid, approver="bob", approver_name="Bob Tech Lead")
    assert res1["status"] == "pending"
    assert len(res1["signatures"]) == 1
    assert approval_service.is_quorum_reached(aid) is False

    # Approver 1 signs again -> idempotent, no duplicate
    res1_dup = approval_service.record_approval_signature(aid, approver="bob")
    assert len(res1_dup["signatures"]) == 1

    # Approver 2 signs -> Quorum reached!
    res2 = approval_service.record_approval_signature(aid, approver="charlie", approver_name="Charlie DevOps")
    assert res2["status"] == "approved"
    assert len(res2["signatures"]) == 2
    assert approval_service.is_quorum_reached(aid) is True


def test_approval_ttl_expiry(data_dir):
    """UC615: Approval request TTL expiration."""
    from services import approval_service

    proj = "proj-ttl"
    stk = "web-stack"

    # Create approval with short TTL (e.g. 60 seconds)
    appr = approval_service.create_approval(
        stack=stk, project_id=proj, action="apply", requested_by="alice", ttl_seconds=60
    )
    aid = appr["id"]
    assert appr["status"] == "pending"
    assert appr["expires_at"] > time.time()
    assert approval_service.is_approval_expired(appr) is False

    # Simulate expired approval by modifying expires_at in the past
    records = approval_service._load()
    for r in records:
        if r.get("id") == aid:
            r["expires_at"] = time.time() - 10
    approval_service._save(records)

    # Listing should mark status as expired
    all_appr = approval_service.list_approvals(project_id=proj)
    target = next((r for r in all_appr if r["id"] == aid), None)
    assert target is not None
    assert target["status"] == "expired"


def test_mandatory_rejection_reason(data_dir):
    """UC616: Rejection requires non-empty reason."""
    from services import approval_service

    proj = "proj-rej"
    stk = "worker-stack"

    appr = approval_service.create_approval(
        stack=stk, project_id=proj, action="apply", requested_by="alice"
    )
    aid = appr["id"]

    # Reject without reason -> ValueError
    with pytest.raises(ValueError, match=r"(?i)rejection reason is mandatory"):
        approval_service.reject_approval(aid, rejected_by="bob", reason="")

    with pytest.raises(ValueError, match=r"(?i)rejection reason is mandatory"):
        approval_service.decide(aid, "rejected", decided_by="bob", reason="   ")

    # Reject with valid reason
    res = approval_service.reject_approval(aid, rejected_by="bob", reason="Security policy violation on port 22")
    assert res["status"] == "rejected"
    assert res["rejection_reason"] == "Security policy violation on port 22"


def test_audit_csv_export(data_dir):
    """UC619: Export audit events to CSV."""
    from services import audit_events

    audit_events.record_audit_event(
        action="stack.deploy",
        actor_user_id="user-123",
        target_type="stack",
        target_id="stack-prod",
        meta={"env": "prod"},
    )

    csv_data = audit_events.export_audit_events_csv(limit=50)
    assert "id,actor_user_id,action,target_type,target_id,created_at,meta" in csv_data
    assert "stack.deploy" in csv_data
