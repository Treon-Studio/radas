"""Tests for Test Case Management Fase 6 Advanced features.

UC191: Approval Request Auto-triggers Re-test.
"""
from __future__ import annotations

from unittest.mock import patch
import pytest

from services import approval_service, test_cases


def _seed_stack(tmp_path, project_id="proj-retest", name="demo-stack"):
    from services.cloud_provisioning import _stack_dir
    sd = _stack_dir(project_id, name)
    sd.mkdir(parents=True, exist_ok=True)
    (sd / "terraform.tfvars").write_text('app_vm_count = 3\n')
    return sd



def test_create_approval_triggers_retest(data_dir):
    """UC191: create_approval automatically triggers re-test for the stack and project."""
    _seed_stack(data_dir, project_id="p1", name="stack-a")

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


def test_approval_creation_robust_against_test_failure(data_dir):
    """UC191: Test execution errors do not disrupt or crash approval creation."""
    with patch("services.test_cases.run_all_tests", side_effect=RuntimeError("Test engine crashed!")):
        with patch("services.test_cases.run_batch_tests", side_effect=RuntimeError("Test engine crashed!")):
            approval = approval_service.create_approval("stack-err", "p-err", "apply", requested_by="alice")
            assert approval["id"] is not None
            assert approval["status"] == "pending"
            assert approval["stack"] == "stack-err"
            assert approval["project_id"] == "p-err"


def test_trigger_approval_retest_function(data_dir):
    """UC191: Direct invocation of trigger_approval_retest."""
    _seed_stack(data_dir, project_id="p2", name="stack-b")
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


def test_preview_create_triggers_tests(data_dir):
    """UC192: preview_envs.create automatically triggers test runs for the preview stack."""
    from services import preview_envs

    _seed_stack(data_dir, project_id="p-prev", name="base-stack")

    # Create a test case for pr-42 in project p-prev
    tc = test_cases.create_test_case({
        "name": "Check VM count in preview",
        "stack": "pr-42",
        "kind": "assertion",
        "assertions": ["vm_count_zero"],
    }, project_id="p-prev")

    # Create preview environment for PR 42
    res = preview_envs.create(project_id="p-prev", base_stack="base-stack", pr_number=42)

    assert res["name"] == "pr-42"
    assert res["status"] == "active"
    assert res["execution_id"] is not None

    # Test execution for pr-42 should have run and recorded results
    results = test_cases.list_test_results(project_id="p-prev")
    assert len(results) >= 1
    assert any(r["test_id"] == tc["id"] and r["stack"] == "pr-42" for r in results)


def test_preview_create_robust_against_test_failure(data_dir):
    """UC192: Test execution errors do not prevent or crash preview creation."""
    from services import preview_envs

    _seed_stack(data_dir, project_id="p-prev-fail", name="base-stack-fail")

    with patch("services.test_cases.run_all_tests", side_effect=RuntimeError("Preview test execution exploded!")):
        with patch("services.test_cases.run_batch_tests", side_effect=RuntimeError("Preview test execution exploded!")):
            res = preview_envs.create(project_id="p-prev-fail", base_stack="base-stack-fail", pr_number=99)
            assert res["name"] == "pr-99"
            assert res["status"] == "active"
            assert res["execution_id"] is not None


def test_test_failure_dispatches_webhook(data_dir):
    """UC194: Failing test run dispatches test.failed webhook."""
    sd = _seed_stack(data_dir, project_id="p-wh", name="stack-fail")
    (sd / "terraform.tfvars").write_text('cidr_block = "0.0.0.0/0"\n')

    tc = test_cases.create_test_case({
        "name": "Check Public CIDR",
        "stack": "stack-fail",
        "kind": "assertion",
        "assertions": ["cidr_public"],
        "severity": "warning",
    }, project_id="p-wh")

    with patch("services.webhook_dispatcher.dispatch_event") as mock_dispatch:
        result = test_cases.run_test_case(project_id="p-wh", test_id=tc["id"])
        assert result["status"] == "failed"
        assert result["passed"] is False

        # Should have called dispatch_event with 'test.failed'
        assert mock_dispatch.called
        event_names = [call.args[0] for call in mock_dispatch.call_args_list]
        assert "test.failed" in event_names
        assert "test.blocker_failed" not in event_names

        # Check payload contents
        failed_call = next(call for call in mock_dispatch.call_args_list if call.args[0] == "test.failed")
        payload = failed_call.args[1]
        assert payload["event"] == "test.failed"
        assert payload["project_id"] == "p-wh"
        assert payload["stack"] == "stack-fail"
        assert payload["test_id"] == tc["id"]
        assert payload["test_name"] == "Check Public CIDR"
        assert payload["severity"] == "warning"
        assert len(payload["findings"]) >= 1


def test_test_blocker_failure_dispatches_both_webhooks(data_dir):
    """UC194: Failing blocker test dispatches both test.failed and test.blocker_failed."""
    sd = _seed_stack(data_dir, project_id="p-wh-blocker", name="stack-blocker")
    (sd / "terraform.tfvars").write_text('cidr_block = "0.0.0.0/0"\n')

    tc = test_cases.create_test_case({
        "name": "Blocker CIDR check",
        "stack": "stack-blocker",
        "kind": "assertion",
        "assertions": ["cidr_public"],
        "severity": "blocker",
    }, project_id="p-wh-blocker")

    with patch("services.webhook_dispatcher.dispatch_event") as mock_dispatch:
        result = test_cases.run_test_case(project_id="p-wh-blocker", test_id=tc["id"])
        assert result["status"] == "failed"
        assert result["passed"] is False

        # Both test.failed and test.blocker_failed should be dispatched
        event_names = [call.args[0] for call in mock_dispatch.call_args_list]
        assert "test.failed" in event_names
        assert "test.blocker_failed" in event_names


def test_test_pass_does_not_dispatch_failure_webhooks(data_dir):
    """UC194: Passing test run does not dispatch failure webhooks."""
    sd = _seed_stack(data_dir, project_id="p-wh-pass", name="stack-pass")
    (sd / "terraform.tfvars").write_text('app_vm_count = 5\n')

    tc = test_cases.create_test_case({
        "name": "Check VM count non-zero",
        "stack": "stack-pass",
        "kind": "assertion",
        "assertions": ["vm_count_zero"],
        "severity": "blocker",
    }, project_id="p-wh-pass")

    with patch("services.webhook_dispatcher.dispatch_event") as mock_dispatch:
        result = test_cases.run_test_case(project_id="p-wh-pass", test_id=tc["id"])
        assert result["status"] == "passed"
        assert result["passed"] is True
        assert not mock_dispatch.called


def test_webhook_dispatch_error_handled_gracefully(data_dir):
    """UC194: Webhook dispatch error does not break test case execution."""
    sd = _seed_stack(data_dir, project_id="p-wh-err", name="stack-err")
    (sd / "terraform.tfvars").write_text('cidr_block = "0.0.0.0/0"\n')

    tc = test_cases.create_test_case({
        "name": "Check Public CIDR Error",
        "stack": "stack-err",
        "kind": "assertion",
        "assertions": ["cidr_public"],
        "severity": "blocker",
    }, project_id="p-wh-err")

    with patch("services.webhook_dispatcher.dispatch_event", side_effect=RuntimeError("Webhook endpoint unreachable")):
        # Should not raise exception
        result = test_cases.run_test_case(project_id="p-wh-err", test_id=tc["id"])
        assert result["status"] == "failed"
        assert result["passed"] is False


def test_dispatch_test_failure_notification_direct(data_dir):
    """UC194: Direct invocation of dispatch_test_failure_notification."""
    with patch("services.webhook_dispatcher.dispatch_event") as mock_dispatch:
        test_cases.dispatch_test_failure_notification(
            project_id="p-direct",
            stack="stack-1",
            test_id="tc-1",
            test_name="Security Scan",
            severity="blocker",
            findings=[{"assertion": "cidr_public"}],
            run_id="run-1",
        )
        assert mock_dispatch.called
        events = [c.args[0] for c in mock_dispatch.call_args_list]
        assert "test.failed" in events
        assert "test.blocker_failed" in events



