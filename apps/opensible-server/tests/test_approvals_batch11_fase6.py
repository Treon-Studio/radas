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
