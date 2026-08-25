"""Advanced tests for Test Case Management (UC176, UC179, UC180, UC182, UC190, UC201, UC213).

Verifies scheduled testing (cron), tag filtering, catalog templates,
parameterized tests, batch execution, execution timeouts, and mock provider testing.
"""
from __future__ import annotations

import time
import pytest

from services import test_cases


def _seed_stack(tmp_path, name="advanced-demo"):
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    sd = envs / name
    sd.mkdir(parents=True, exist_ok=True)
    (sd / "terraform.tfvars").write_text('app_vm_count = 5\nmonthly_cost = "$2000"\n')
    return sd


def test_tag_filtering_and_parameters(data_dir):
    """UC179 (tag filtering) & UC182 (parameterized tests)."""
    # 1. Create tests with tags and environment parameters
    t1 = test_cases.create_test_case({
        "name": "Sec Test", "stack": "s1", "kind": "assertion",
        "assertions": ["cidr_public"], "tags": ["security", "compliance"],
        "parameters": {"env": "prod", "max_instances": 10},
    })
    t2 = test_cases.create_test_case({
        "name": "Cost Test", "stack": "s1", "kind": "assertion",
        "assertions": ["budget_exceeded"], "tags": ["cost"],
        "parameters": {"env": "dev", "monthly_budget": 500},
    })
    t3 = test_cases.create_test_case({
        "name": "Drift Test", "stack": "s2", "kind": "assertion",
        "assertions": ["drift_detected"], "tags": ["drift"],
        "parameters": {"env": "prod"},
    })

    # 2. Filter by tag
    sec_tests = test_cases.list_test_cases(tag="security")
    assert len(sec_tests) == 1
    assert sec_tests[0]["id"] == t1["id"]

    cost_tests = test_cases.list_test_cases(tag="cost")
    assert len(cost_tests) == 1
    assert cost_tests[0]["id"] == t2["id"]

    # 3. Filter by environment parameter
    prod_tests = test_cases.list_test_cases(environment="prod")
    assert len(prod_tests) == 2
    assert {t["id"] for t in prod_tests} == {t1["id"], t3["id"]}


def test_test_templates_catalog(data_dir):
    """UC180: Test template dari katalog."""
    templates = test_cases.list_templates()
    assert isinstance(templates, list)
    assert len(templates) >= 3
    # Check template keys
    slugs = [tmpl.get("slug") or tmpl.get("id") for tmpl in templates]
    assert any("security" in str(s) or "compliance" in str(s) or "baseline" in str(s) for s in slugs)


def test_batch_run_and_timeout_mock_provider(data_dir, tmp_path, monkeypatch):
    """UC190 (batch run), UC201 (timeout), UC213 (mock provider), UC176 (cron/schedule)."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    _seed_stack(tmp_path, "advanced-demo")

    # 1. Create multiple test cases for the stack
    t1 = test_cases.create_test_case({
        "name": "Check 1", "stack": "advanced-demo", "kind": "assertion",
        "assertions": ["cidr_public"], "tags": ["security"],
        "schedule": "0 * * * *",  # hourly schedule
    })
    t2 = test_cases.create_test_case({
        "name": "Check 2", "stack": "advanced-demo", "kind": "assertion",
        "assertions": ["budget_exceeded"], "tags": ["cost"],
        "schedule": "0 0 * * *",
    })

    # 2. Run batch execution
    batch_res = test_cases.run_batch_tests(None, stack="advanced-demo")
    assert batch_res["count"] == 2
    assert len(batch_res["results"]) == 2

    # 3. Run scheduled tests
    sched_res = test_cases.run_scheduled_tests(None, timeout_seconds=10)
    assert sched_res["count"] == 2
    assert len(sched_res["errors"]) == 0

    # 4. Run test with mock provider offline
    mock_res = test_cases.run_test_case(None, t1["id"], mock_provider=True)
    assert "mock_provider" in mock_res or mock_res.get("status") in ("passed", "failed")
