from __future__ import annotations


def _case():
    from services.test_cases import create_test_case
    return create_test_case({"name": "iac", "stack": "demo", "kind": "iac_scan"}, "p")


def test_iac_scan_mock_runs_both_tools(data_dir, monkeypatch):
    from services import test_cases
    case = _case()
    monkeypatch.setattr("services.cloud_provisioning._stack_dir", lambda project_id, stack: data_dir)
    calls = []

    def fake(command, **kwargs):
        calls.append((command, kwargs))
        return {"tool": command, "status": "mocked", "returncode": 0, "output": "mock"}

    monkeypatch.setattr(test_cases, "run_bounded_tool", fake)
    result = test_cases.run_test_case("p", case["id"], mock_provider=True)
    assert result["passed"] is True
    assert calls and [item[0] for item in calls] == ["checkov", "tfsec"]
    finding = result["findings"][0]
    assert finding["tool_status"] == {"checkov": "mocked", "tfsec": "mocked"}
    assert set(finding["tool_results"]) == {"checkov", "tfsec"}


def test_iac_scan_unavailable_is_explicit_failure(data_dir, monkeypatch):
    from services import test_cases
    case = _case()
    monkeypatch.setattr("services.cloud_provisioning._stack_dir", lambda project_id, stack: data_dir)
    monkeypatch.setattr(test_cases, "run_bounded_tool", lambda command, **kwargs: {
        "tool": command, "status": "unavailable", "returncode": None, "output": "tool not installed"
    })
    result = test_cases.run_test_case("p", case["id"])
    assert result["passed"] is False
    assert result["findings"][0]["tool_status"] == {"checkov": "unavailable", "tfsec": "unavailable"}


def test_iac_scan_timeout_and_mixed_result_schema(data_dir, monkeypatch):
    from services import test_cases
    case = _case()
    monkeypatch.setattr("services.cloud_provisioning._stack_dir", lambda project_id, stack: data_dir)

    def fake(command, **kwargs):
        if command == "checkov":
            return {"tool": command, "status": "timeout", "returncode": None, "output": "tool timed out"}
        return {"tool": command, "status": "failed", "returncode": 1, "output": "finding"}

    monkeypatch.setattr(test_cases, "run_bounded_tool", fake)
    result = test_cases.run_test_case("p", case["id"], timeout_seconds=7)
    assert result["passed"] is False
    assert result["timeout_seconds"] == 7
    finding = result["findings"][0]
    assert finding["tool_status"] == {"checkov": "timeout", "tfsec": "failed"}
    assert finding["tool_results"]["checkov"]["returncode"] is None
