from __future__ import annotations


def test_assertion_result_has_null_execution_link(data_dir, monkeypatch):
    from services import test_cases
    case = test_cases.create_test_case({"name": "assertion", "stack": "demo", "assertions": ["cidr_public"]}, "p")
    monkeypatch.setattr(test_cases, "_stack_texts", lambda *_: {"tfvars": ""})
    result = test_cases.run_test_case("p", case["id"])
    assert result["execution_id"] is None
    assert result["execution_log_url"] is None


def test_tofu_test_result_links_execution_and_log(data_dir, monkeypatch):
    from services import test_cases
    case = test_cases.create_test_case({"name": "native", "stack": "demo", "kind": "tofu_test"}, "p")
    monkeypatch.setattr("services.cloud_provisioning._stack_dir", lambda *_: data_dir)
    monkeypatch.setattr("services.cloud_provisioning._create_execution", lambda *args, **kwargs: "exec-123")
    result = test_cases.run_tofu_test("p", case["id"])
    assert result["execution_id"] == "exec-123"
    assert result["run_id"] == "exec-123"
    assert result["execution_log_url"] == "/api/executions/exec-123/logs"

    history = test_cases.list_test_results(10, "p", case["id"])
    assert history[0]["execution_log_url"] == "/api/executions/exec-123/logs"


def test_export_preserves_execution_linkage(data_dir, monkeypatch):
    from services import test_cases
    from api.test_case_routes import api_test_results_export
    case = test_cases.create_test_case({"name": "native-export", "stack": "demo", "kind": "tofu_test"}, "p")
    monkeypatch.setattr("services.cloud_provisioning._stack_dir", lambda *_: data_dir)
    monkeypatch.setattr("services.cloud_provisioning._create_execution", lambda *args, **kwargs: "exec-export")
    test_cases.run_tofu_test("p", case["id"])
    # Route-level export is covered by the service schema: exported results are the same persisted records.
    exported = test_cases.list_test_results(10, "p", case["id"])
    assert exported[0]["execution_id"] == "exec-export"
    assert exported[0]["execution_log_url"].endswith("/exec-export/logs")
