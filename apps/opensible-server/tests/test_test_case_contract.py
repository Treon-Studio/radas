from __future__ import annotations
import pytest

def test_new_assertions_are_catalogued(data_dir):
    from services.test_cases import ASSERTIONS, create_test_case
    for key in ("provider_image_outdated", "budget_exceeded", "instance_count_exceeded", "missing_environment_owner_tags"):
        assert key in ASSERTIONS
        assert create_test_case({"name": key, "stack": "demo", "assertions": [key], "tags": ["security"], "parameters": {"env": "prod"}}, "p")["assertions"] == [key]

def test_invalid_assertion_and_tags_rejected(data_dir):
    from services.test_cases import create_test_case
    with pytest.raises(ValueError, match="unknown assertions"):
        create_test_case({"name":"bad","stack":"demo","assertions":["nope"]}, "p")
    with pytest.raises(ValueError, match="tags"):
        create_test_case({"name":"bad","stack":"demo","assertions":["cidr_public"],"tags":[""]}, "p")

def test_bounded_tool_mock_and_unavailable(data_dir):
    from services.test_cases import run_bounded_tool
    assert run_bounded_tool("checkov", mock=True)["status"] == "mocked"
    assert run_bounded_tool("tflint", timeout_seconds=1)["status"] in {"unavailable", "passed", "failed", "timeout"}


def test_semantic_assertions_use_parameters(data_dir, monkeypatch):
    from services import test_cases
    case = test_cases.create_test_case({
        "name": "semantic", "stack": "demo",
        "assertions": ["budget_exceeded", "instance_count_exceeded", "missing_environment_owner_tags"],
        "parameters": {"monthly_budget": 100, "max_instances": 2},
    }, "p")
    monkeypatch.setattr(test_cases, "_stack_texts", lambda project_id, stack: {
        "tfvars": 'monthly_cost = 101\ninstance_count = 3\ntags = { environment = "prod" }'
    })
    result = test_cases.run_test_case("p", case["id"])
    assert result["passed"] is False
    assert {finding["assertion"] for finding in result["findings"]} == {
        "budget_exceeded", "instance_count_exceeded", "missing_environment_owner_tags"
    }


def test_definition_versions_and_rollback(data_dir):
    from services import test_cases
    case = test_cases.create_test_case({"name": "v1", "stack": "demo", "assertions": ["cidr_public"]}, "p")
    test_cases.update_test_case(case["id"], {"name": "v2"}, "p")
    versions = test_cases.list_test_case_versions(case["id"], "p")
    assert [item["version"] for item in versions] == [1, 2]
    restored = test_cases.rollback_test_case(case["id"], 1, "p")
    assert restored["name"] == "v1"
    assert len(test_cases.list_test_case_versions(case["id"], "p")) == 3


def test_ansible_validation_runs_lint_and_syntax_in_mock_mode(data_dir, monkeypatch):
    from services import test_cases
    case = test_cases.create_test_case({"name": "ansible", "stack": "demo", "kind": "ansible_validate"}, "p")
    monkeypatch.setattr("services.cloud_provisioning._stack_dir", lambda project_id, stack: data_dir)
    monkeypatch.setattr(test_cases, "run_bounded_tool", lambda command, **kwargs: {
        "tool": command, "status": "mocked", "returncode": 0, "output": "mock"
    })
    result = test_cases.run_test_case("p", case["id"], mock_provider=True)
    assert result["passed"] is True
    assert result["findings"][0]["tool_status"] == {"lint": "mocked", "syntax": "mocked"}


def test_definition_validation_is_non_persisting(data_dir):
    from services.test_cases import list_test_cases, validate_test_definition
    invalid = validate_test_definition({"name": "bad", "stack": "demo", "assertions": ["unknown"]})
    assert invalid["valid"] is False
    assert "unknown assertions: unknown" in invalid["errors"]
    assert list_test_cases("p") == []
    valid = validate_test_definition({"name": "ok", "kind": "assertion", "assertions": ["cidr_public"], "tags": ["security"]})
    assert valid["valid"] is True


def test_baseline_detects_regression(data_dir, monkeypatch):
    from services import test_cases
    case = test_cases.create_test_case({"name": "baseline", "stack": "demo", "assertions": ["cidr_public"]}, "p")
    states = iter(["", "0.0.0.0/0"])
    monkeypatch.setattr(test_cases, "_stack_texts", lambda project_id, stack: {"tfvars": next(states)})
    first = test_cases.run_test_case("p", case["id"])
    baseline = test_cases.create_test_baseline("p", case["id"], first["run_id"])
    current = test_cases.run_test_case("p", case["id"])
    comparison = test_cases.compare_test_baseline("p", case["id"])
    assert baseline["run_id"] == first["run_id"]
    assert current["passed"] is False
    assert comparison["regressed"] is True
    assert comparison["passed"] is False


def test_tofu_validate_uses_bounded_tool_and_mock_mode(data_dir, monkeypatch):
    from services import test_cases
    case = test_cases.create_test_case({"name": "validate", "stack": "demo", "kind": "tofu_validate"}, "p")
    monkeypatch.setattr("services.cloud_provisioning._stack_dir", lambda project_id, stack: data_dir)
    monkeypatch.setattr(test_cases, "run_bounded_tool", lambda *args, **kwargs: {
        "tool": "tofu", "status": "mocked", "returncode": 0, "output": "mock"
    })
    result = test_cases.run_test_case("p", case["id"], mock_provider=True)
    assert result["passed"] is True
    assert result["findings"][0]["tool_status"] == "mocked"


def test_batch_runner_caps_concurrency_and_runs_enabled_cases(data_dir, monkeypatch):
    from services import test_cases
    for name in ("one", "two", "three"):
        test_cases.create_test_case({"name": name, "stack": "demo", "assertions": ["cidr_public"]}, "p")
    monkeypatch.setattr(test_cases, "_stack_texts", lambda project_id, stack: {"tfvars": ""})
    result = test_cases.run_batch_tests("p", "demo", concurrency=99)
    assert result["count"] == 3
    assert result["concurrency"] == 8
    assert all(item["passed"] for item in result["results"])


def test_drift_assertion_compares_config_and_state(data_dir, monkeypatch):
    from services import test_cases
    case = test_cases.create_test_case({"name": "drift", "stack": "demo", "assertions": ["drift_detected"]}, "p")
    monkeypatch.setattr(test_cases, "_stack_texts", lambda project_id, stack: {
        "tfvars": 'instance_type = "small"', "state": '{"instance_type":"large"}'
    })
    result = test_cases.run_test_case("p", case["id"])
    assert result["passed"] is False
    assert result["findings"][0]["assertion"] == "drift_detected"


def test_drift_assertion_passes_when_config_and_state_match(data_dir, monkeypatch):
    from services import test_cases
    case = test_cases.create_test_case({"name": "no-drift", "stack": "demo", "assertions": ["drift_detected"]}, "p")
    monkeypatch.setattr(test_cases, "_stack_texts", lambda project_id, stack: {
        "tfvars": 'instance_type = "small"', "state": 'instance_type = "small"'
    })
    assert test_cases.run_test_case("p", case["id"])["passed"] is True


def test_failed_test_retries_with_bounded_exponential_backoff(data_dir, monkeypatch):
    from services import test_cases
    case = test_cases.create_test_case({"name": "retry", "stack": "demo", "assertions": ["cidr_public"]}, "p")
    monkeypatch.setattr(test_cases, "_stack_texts", lambda project_id, stack: {"tfvars": "0.0.0.0/0"})
    sleeps = []
    result = test_cases.run_test_case("p", case["id"], max_retries=8, backoff_base_seconds=2, sleep_fn=sleeps.append)
    assert result["retry_count"] == 5
    assert len(result["attempts"]) == 6
    assert sleeps == [2, 4, 8, 16, 30]
    assert result["status"] == "failed"


def test_retry_stops_after_success(data_dir, monkeypatch):
    from services import test_cases
    case = test_cases.create_test_case({"name": "retry-success", "stack": "demo", "assertions": ["cidr_public"]}, "p")
    values = iter(["0.0.0.0/0", ""])
    monkeypatch.setattr(test_cases, "_stack_texts", lambda project_id, stack: {"tfvars": next(values)})
    sleeps = []
    result = test_cases.run_test_case("p", case["id"], max_retries=3, backoff_base_seconds=1, sleep_fn=sleeps.append)
    assert result["passed"] is True
    assert result["retry_count"] == 1
    assert sleeps == [1]


def test_update_rejects_invalid_contract(data_dir):
    from services.test_cases import create_test_case, update_test_case
    case = create_test_case({"name": "valid", "stack": "demo", "assertions": ["cidr_public"]}, "p")
    with pytest.raises(ValueError, match="unknown assertions"):
        update_test_case(case["id"], {"assertions": ["nope"]}, "p")
    with pytest.raises(ValueError, match="tags"):
        update_test_case(case["id"], {"tags": [""]}, "p")
