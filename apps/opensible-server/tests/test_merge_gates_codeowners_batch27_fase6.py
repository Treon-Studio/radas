import pytest


def test_multi_check_merge_gate():
    from services.merge_gate import evaluate_merge_gate

    required = ["lint", "unit_tests", "tofu_plan", "security_scan"]

    # 1. All passed
    results_pass = {
        "lint": "success",
        "unit_tests": "success",
        "tofu_plan": "success",
        "security_scan": "passed",
    }
    gate_ok = evaluate_merge_gate(required, results_pass)
    assert gate_ok["can_merge"] is True
    assert gate_ok["passed_count"] == 4
    assert len(gate_ok["failed_checks"]) == 0

    # 2. Missing or failed check
    results_fail = {
        "lint": "success",
        "unit_tests": "failed",
        "tofu_plan": "success",
    }
    gate_fail = evaluate_merge_gate(required, results_fail)
    assert gate_fail["can_merge"] is False
    assert "unit_tests" in gate_fail["failed_checks"]
    assert "security_scan" in gate_fail["missing_checks"]


def test_branch_protection_sync(pg_db):
    from services.branch_protection import sync_branch_protection_policy

    res = sync_branch_protection_policy(
        repo_name="org/infra-repo",
        branch="main",
        enforce_linear_history=True,
        require_approvals=2,
    )
    assert res["success"] is True
    assert res["repo"] == "org/infra-repo"
    assert res["branch"] == "main"
    assert res["require_approvals"] == 2
    assert res["enforce_linear_history"] is True
