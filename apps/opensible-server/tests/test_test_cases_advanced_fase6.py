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


def test_compute_stack_security_score_perfect(data_dir):
    """UC202: Security score calculation with perfect score (100, Grade A)."""
    _seed_stack(data_dir, project_id="p-score", name="stack-clean")
    tc = test_cases.create_test_case({
        "name": "Check VM count clean",
        "stack": "stack-clean",
        "kind": "assertion",
        "assertions": ["vm_count_zero"],
        "severity": "info",
    }, project_id="p-score")

    # Run the test so it passes
    test_cases.run_test_case(project_id="p-score", test_id=tc["id"])

    score_data = test_cases.compute_stack_security_score(project_id="p-score", stack="stack-clean")
    assert score_data["project_id"] == "p-score"
    assert score_data["stack"] == "stack-clean"
    assert score_data["score"] == 100
    assert score_data["grade"] == "A"
    assert score_data["total_tests"] == 1
    assert score_data["passed_tests"] == 1
    assert score_data["failed_tests"] == 0
    assert score_data["deductions"] == {"blocker": 0, "warning": 0, "info": 0}
    assert isinstance(score_data["timestamp"], int)


def test_compute_stack_security_score_deductions_and_floor(data_dir):
    """UC202: Deductions per failing severity and floor at 0."""
    sd = _seed_stack(data_dir, project_id="p-deduct", name="stack-dirty")
    (sd / "terraform.tfvars").write_text('cidr_block = "0.0.0.0/0"\n')

    # Create 1 failing blocker (-30), 1 failing warning (-10), 1 failing info (-2)
    # Total deduction: 42 -> Score = 58 -> Grade F
    tc1 = test_cases.create_test_case({
        "name": "Blocker CIDR",
        "stack": "stack-dirty",
        "kind": "assertion",
        "assertions": ["cidr_public"],
        "severity": "blocker",
    }, project_id="p-deduct")
    tc2 = test_cases.create_test_case({
        "name": "Warning CIDR",
        "stack": "stack-dirty",
        "kind": "assertion",
        "assertions": ["cidr_public"],
        "severity": "warning",
    }, project_id="p-deduct")
    tc3 = test_cases.create_test_case({
        "name": "Info CIDR",
        "stack": "stack-dirty",
        "kind": "assertion",
        "assertions": ["cidr_public"],
        "severity": "info",
    }, project_id="p-deduct")

    test_cases.run_test_case(project_id="p-deduct", test_id=tc1["id"])
    test_cases.run_test_case(project_id="p-deduct", test_id=tc2["id"])
    test_cases.run_test_case(project_id="p-deduct", test_id=tc3["id"])

    score_data = test_cases.compute_stack_security_score(project_id="p-deduct", stack="stack-dirty")
    assert score_data["score"] == 58
    assert score_data["grade"] == "F"
    assert score_data["total_tests"] == 3
    assert score_data["passed_tests"] == 0
    assert score_data["failed_tests"] == 3
    assert score_data["deductions"] == {"blocker": 30, "warning": 10, "info": 2}

    # Add 3 more failing blockers: deduction = 30*4 + 10 + 2 = 132 -> Score should be bounded to 0 (floor)
    for i in range(3):
        tc_extra = test_cases.create_test_case({
            "name": f"Extra Blocker {i}",
            "stack": "stack-dirty",
            "kind": "assertion",
            "assertions": ["cidr_public"],
            "severity": "blocker",
        }, project_id="p-deduct")
        test_cases.run_test_case(project_id="p-deduct", test_id=tc_extra["id"])

    score_floor = test_cases.compute_stack_security_score(project_id="p-deduct", stack="stack-dirty")
    assert score_floor["score"] == 0
    assert score_floor["grade"] == "F"
    assert score_floor["failed_tests"] == 6


def test_api_security_score_endpoint(data_dir):
    """UC202: GET /api/test-cases/score with auth and project scoping."""
    import time
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from storage import pg
    from services.org_service import create_org
    from api.test_case_routes import bp

    # Seed org and projects
    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", ("u1", "alice", "x"))
    org_a = create_org("Org A", "u1")
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s)",
        ("project-score", org_a["id"], "u1", "project-score", "", time.time()),
    )

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access")
    headers = {
        "X-Project-Id": "project-score",
        "Authorization": f"Bearer {token}",
    }

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    # Create a test case and run it
    tc = test_cases.create_test_case({
        "name": "Score Route Test",
        "stack": "stack-route",
        "kind": "assertion",
        "assertions": ["vm_count_zero"],
        "severity": "warning",
    }, project_id="project-score")
    test_cases.run_test_case(project_id="project-score", test_id=tc["id"])

    # Query GET /api/test-cases/score?project_id=project-score&stack=stack-route
    res = client.get("/api/test-cases/score?project_id=project-score&stack=stack-route", headers=headers)
    assert res.status_code == 200, res.data
    body = res.get_json()
    assert body["project_id"] == "project-score"
    assert body["stack"] == "stack-route"
    assert "score" in body
    assert "grade" in body
    assert "deductions" in body


def test_run_ansible_idempotency_test_passed(data_dir):
    """UC206: Idempotent playbook execution (pass_2_changed = 0) -> passed."""
    res = test_cases.run_ansible_idempotency_test(
        project_id="p-idem",
        stack="web-stack",
        playbook="site.yml",
        pass_1_changed=3,
        pass_2_changed=0,
    )
    assert res["idempotent"] is True
    assert res["status"] == "passed"
    assert res["passed"] is True
    assert res["findings"] == []
    assert res["pass_1"]["changed"] == 3
    assert res["pass_2"]["changed"] == 0

    # Ensure saved to test results history
    history = test_cases.list_test_results(project_id="p-idem")
    assert len(history) >= 1
    assert any(r["test_id"] == res["test_id"] and r["passed"] is True for r in history)


def test_run_ansible_idempotency_test_failed(data_dir):
    """UC206: Non-idempotent playbook execution (pass_2_changed > 0) -> failed."""
    res = test_cases.run_ansible_idempotency_test(
        project_id="p-idem-fail",
        stack="db-stack",
        playbook="db.yml",
        pass_1_changed=2,
        pass_2_changed=1,
    )
    assert res["idempotent"] is False
    assert res["status"] == "failed"
    assert res["passed"] is False
    assert len(res["findings"]) == 1
    assert "Playbook 'db.yml' was not idempotent" in res["findings"][0]["message"]

    history = test_cases.list_test_results(project_id="p-idem-fail")
    assert len(history) >= 1
    assert any(r["test_id"] == res["test_id"] and r["passed"] is False for r in history)


def test_api_ansible_idempotency_endpoint(data_dir):
    """UC206: POST /api/test-cases/ansible-idempotency route with auth & scoping."""
    import time
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from storage import pg
    from services.org_service import create_org
    from api.test_case_routes import bp

    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", ("u-idem", "idem_user", "x"))
    org_a = create_org("Org Idem", "u-idem")
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s)",
        ("proj-idem-api", org_a["id"], "u-idem", "proj-idem-api", "", time.time()),
    )

    token = generate_token("u-idem", "idem_user", ["admin"], Path("/tmp"), token_type="access")
    headers = {
        "X-Project-Id": "proj-idem-api",
        "Authorization": f"Bearer {token}",
    }

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    resp = client.post(
        "/api/test-cases/ansible-idempotency",
        json={"stack": "app-tier", "playbook": "deploy.yml", "pass_1_changed": 5, "pass_2_changed": 0},
        headers=headers,
    )
    assert resp.status_code == 200, resp.data
    data = resp.get_json()
    assert data["idempotent"] is True
    assert data["status"] == "passed"
    assert data["project_id"] == "proj-idem-api"
    assert data["stack"] == "app-tier"
    assert data["playbook"] == "deploy.yml"





