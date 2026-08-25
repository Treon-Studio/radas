"""Project isolation and run-state regressions for test cases."""
from __future__ import annotations


def test_test_cases_and_results_are_project_scoped(data_dir, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from services.test_cases import create_test_case, list_test_cases, run_test_case, list_test_results

    first = create_test_case({"name": "first", "stack": "demo", "kind": "assertion", "assertions": ["secret_in_tfvars"]}, "project-a")
    second = create_test_case({"name": "second", "stack": "demo", "kind": "assertion", "assertions": ["secret_in_tfvars"]}, "project-b")

    assert [item["id"] for item in list_test_cases("project-a")] == [first["id"]]
    assert [item["id"] for item in list_test_cases("project-b")] == [second["id"]]
    assert list_test_results(project_id="project-a") == []
    try:
        run_test_case("project-a", second["id"])
        assert False, "a case from another project must not be runnable"
    except ValueError as exc:
        assert "not found" in str(exc)
    assert list_test_results(project_id="project-a") == []


def test_disabled_test_cannot_run(data_dir):
    from services.test_cases import create_test_case, update_test_case, run_test_case

    case = create_test_case({"name": "disabled", "stack": "demo", "kind": "assertion", "assertions": ["cidr_public"]}, "project-a")
    update_test_case(case["id"], {"enabled": False}, "project-a")
    try:
        run_test_case("project-a", case["id"])
        assert False, "disabled test should not run"
    except ValueError as exc:
        assert "disabled" in str(exc)


def test_tofu_test_result_starts_queued(data_dir, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from pathlib import Path
    env = Path(tmp_path) / "projects" / "project-a" / "stacks" / "envs" / "demo"
    env.mkdir(parents=True)
    from services.test_cases import create_test_case, run_tofu_test
    case = create_test_case({"name": "native", "stack": "demo", "kind": "tofu_test"}, "project-a")
    result = run_tofu_test("project-a", case["id"])
    assert result["status"] == "queued"
    assert result["passed"] is False
