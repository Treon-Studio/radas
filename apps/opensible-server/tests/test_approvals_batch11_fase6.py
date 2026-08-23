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
