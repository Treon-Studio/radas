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


def test_infra_pr_template_generator():
    from services.pr_template_generator import generate_infra_pr_template

    md = generate_infra_pr_template(
        stack_name="prod-db-replica",
        environment="production",
        changes_summary="Upgraded Aurora Postgres instance class from r5.large to r6g.xlarge",
    )
    assert "Infrastructure Change Summary" in md
    assert "prod-db-replica" in md
    assert "production" in md
    assert "Verification & Testing Checklist" in md


def test_code_owners_parser():
    from services.code_owners import find_code_owners

    codeowners = """
    # Global default
    * @infra-team

    # Production changes require security lead
    envs/prod/* @security-lead @lead-infra

    # Modules
    modules/** @module-maintainers
    """

    # 1. Matches global default
    owners_root = find_code_owners(codeowners, "README.md")
    assert owners_root == ["@infra-team"]

    # 2. Matches prod env override
    owners_prod = find_code_owners(codeowners, "envs/prod/main.tf")
    assert "@security-lead" in owners_prod
    assert "@lead-infra" in owners_prod

    # 3. Matches modules pattern
    owners_mod = find_code_owners(codeowners, "modules/vpc/main.tf")
    assert owners_mod == ["@module-maintainers"]


def test_offline_init_configuration():
    from services.offline_init import configure_offline_init_env

    env = configure_offline_init_env(
        plugin_cache_dir="/var/cache/radas/tofu_plugins",
        mirror_dir="/opt/radas/mirrors/providers",
    )
    assert env["TF_PLUGIN_CACHE_DIR"] == "/var/cache/radas/tofu_plugins"
    assert env["RADAS_PROVIDER_MIRROR_DIR"] == "/opt/radas/mirrors/providers"


def test_project_log_retention_policy(pg_db):
    from services.log_retention_policy import set_project_log_retention, get_project_log_retention

    # 1. Default fallback is 90
    assert get_project_log_retention("p-new-unconfigured") == 90

    # 2. Set to 180 days
    set_res = set_project_log_retention("p-audit-heavy", retention_days=180)
    assert set_res["success"] is True
    assert set_res["retention_days"] == 180

    # 3. Query back
    assert get_project_log_retention("p-audit-heavy") == 180


