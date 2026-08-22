"""Tests for Test Case Management Fase 6 Advanced features.

UC191: Approval Request Auto-triggers Re-test.
"""
from __future__ import annotations

from unittest.mock import patch
import pytest

from services import approval_service, test_cases


def _seed_stack(tmp_path, project_id="proj-retest", name="demo-stack"):
    envs = tmp_path / "cloud-provisioning" / project_id / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    sd = envs / name
    sd.mkdir(parents=True, exist_ok=True)
    (sd / "terraform.tfvars").write_text('app_vm_count = 3\n')
    return sd


def test_create_approval_triggers_retest(tmp_path, monkeypatch):
    """UC191: create_approval automatically triggers re-test for the stack and project."""
    import app
    monkeypatch.setattr(app, "DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    _seed_stack(tmp_path, project_id="p1", name="stack-a")

    # Create a test case for stack-a in project p1
    tc = test_cases.create_test_case({
        "name": "Check VM count",
        "stack": "stack-a",
        "kind": "assertion",
        "assertions": ["vm_count_zero"],
    }, project_id="p1")

    # When approval is created
    approval = approval_service.create_approval("stack-a", "p1", "apply", requested_by="tester", note="Deploying v2")

    assert approval["id"] is not None
    assert approval["status"] == "pending"
    assert approval["stack"] == "stack-a"
    assert approval["project_id"] == "p1"

    # Test results should now exist for project p1
    results = test_cases.list_test_results(project_id="p1")
    assert len(results) >= 1
    assert any(r["test_id"] == tc["id"] for r in results)


def test_approval_creation_robust_against_test_failure(tmp_path, monkeypatch):
    """UC191: Test execution errors do not disrupt or crash approval creation."""
    import app
    monkeypatch.setattr(app, "DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    with patch("services.test_cases.run_all_tests", side_effect=RuntimeError("Test engine crashed!")):
        with patch("services.test_cases.run_batch_tests", side_effect=RuntimeError("Test engine crashed!")):
            approval = approval_service.create_approval("stack-err", "p-err", "apply", requested_by="alice")
            assert approval["id"] is not None
            assert approval["status"] == "pending"
            assert approval["stack"] == "stack-err"
            assert approval["project_id"] == "p-err"


def test_trigger_approval_retest_function(tmp_path, monkeypatch):
    """UC191: Direct invocation of trigger_approval_retest."""
    import app
    monkeypatch.setattr(app, "DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    _seed_stack(tmp_path, project_id="p2", name="stack-b")
    test_cases.create_test_case({
        "name": "Check Public CIDR",
        "stack": "stack-b",
        "kind": "assertion",
        "assertions": ["cidr_public"],
    }, project_id="p2")

    # Check function exists in approval_service or test_cases
    assert hasattr(approval_service, "trigger_approval_retest") or hasattr(test_cases, "trigger_approval_retest")

    fn = getattr(approval_service, "trigger_approval_retest", None) or getattr(test_cases, "trigger_approval_retest")
    res = fn("p2", "stack-b", "appr-123")
    assert res is not None
