"""Unit tests for test-case registry, assertion runner & apply gate (UC 161-175)."""
from __future__ import annotations

import json


def _seed_stack(tmp_path, name="demo"):
    """Create a minimal stack workspace dir with a tfvars file."""
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    sd = envs / name
    sd.mkdir()
    (sd / "terraform.tfvars").write_text('password = "sup3rs3cret"\napp_vm_count = 2\n')
    return sd


def test_create_test_case_roundtrip(data_dir):
    from services.test_cases import create_test_case, list_test_cases
    tc = create_test_case({"name": "sec", "stack": "demo", "kind": "assertion",
                           "assertions": ["secret_in_tfvars"], "severity": "blocker"})
    assert tc["assertions"] == ["secret_in_tfvars"]
    assert len(list_test_cases()) == 1

def test_assertion_kind_requires_assertions(data_dir):
    from services.test_cases import create_test_case
    try:
        create_test_case({"name": "bad", "stack": "s", "kind": "assertion", "assertions": []})
        assert False, "should raise"
    except ValueError as e:
        assert "at least one assertion" in str(e)

def test_update_and_delete(data_dir):
    from services.test_cases import create_test_case, update_test_case, delete_test_case
    tc = create_test_case({"name": "x", "stack": "s", "kind": "assertion",
                           "assertions": ["cidr_public"]})
    assert update_test_case(tc["id"], {"enabled": False})["enabled"] is False
    assert delete_test_case(tc["id"]) is True

def test_run_detects_secret_in_tfvars(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    _seed_stack(tmp_path)
    from services.test_cases import create_test_case, run_test_case
    tc = create_test_case({"name": "sec", "stack": "demo", "kind": "assertion",
                           "assertions": ["secret_in_tfvars"], "severity": "blocker"})
    result = run_test_case(None, tc["id"])
    assert result["passed"] is False
    assert any(f["assertion"] == "secret_in_tfvars" for f in result["findings"])

def test_run_passes_on_clean(data_dir, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    sd = envs / "clean"
    sd.mkdir()
    (sd / "terraform.tfvars").write_text("app_vm_count = 1\n")
    from services.test_cases import create_test_case, run_test_case
    tc = create_test_case({"name": "c", "stack": "clean", "kind": "assertion",
                           "assertions": ["secret_in_tfvars"], "severity": "warning"})
    assert run_test_case(None, tc["id"])["passed"] is True

def test_latest_failed_blocker_gates_apply(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    _seed_stack(tmp_path)
    from services.test_cases import create_test_case, run_test_case, latest_failed_blocker
    tc = create_test_case({"name": "blk", "stack": "demo", "kind": "assertion",
                           "assertions": ["secret_in_tfvars"], "severity": "blocker"})
    run_test_case(None, tc["id"])
    bad = latest_failed_blocker(None, "demo")
    assert bad is not None and bad["severity"] == "blocker"

def test_latest_failed_blocker_none_when_passing(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    (envs / "ok").mkdir()
    (envs / "ok" / "terraform.tfvars").write_text("app_vm_count = 1\n")
    from services.test_cases import create_test_case, run_test_case, latest_failed_blocker
    tc = create_test_case({"name": "ok", "stack": "ok", "kind": "assertion",
                           "assertions": ["secret_in_tfvars"], "severity": "blocker"})
    run_test_case(None, tc["id"])
    assert latest_failed_blocker(None, "ok") is None


def test_missing_environment_owner_tags_and_budget_exceeded(tmp_path, monkeypatch):
    """UC169 and UC171 assertion validations."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    envs = tmp_path / "cloud-provisioning" / "default" / "envs"
    envs.mkdir(parents=True, exist_ok=True)
    sd = envs / "tagged-demo"
    sd.mkdir()
    (sd / "terraform.tfvars").write_text('monthly_cost = "$5000"\ntags = {\n  owner = "alice"\n}\n')

    from services.test_cases import create_test_case, run_test_case
    # Test tags assertion (missing environment tag)
    tc1 = create_test_case({"name": "tag-check", "stack": "tagged-demo", "kind": "assertion",
                            "assertions": ["missing_environment_owner_tags"], "severity": "warning"})
    res1 = run_test_case(None, tc1["id"])
    assert res1["passed"] is False
    assert any(f["assertion"] == "missing_environment_owner_tags" for f in res1["findings"])

    # Test budget exceeded assertion
    tc2 = create_test_case({"name": "budget-check", "stack": "tagged-demo", "kind": "assertion",
                            "assertions": ["budget_exceeded"], "severity": "blocker"})
    res2 = run_test_case(None, tc2["id"])
    assert res2["passed"] is False
    assert any(f["assertion"] == "budget_exceeded" for f in res2["findings"])
