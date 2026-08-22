from __future__ import annotations

import json


def test_retry_execution_preserves_stack_run_params_and_chain(monkeypatch, tmp_path):
    from services import execution_retry

    project = "project-retry"
    execution = "failed-1"
    executions = tmp_path / "executions"
    executions.mkdir()
    path = executions / f"{execution}.json"
    path.write_text(json.dumps({
        "id": execution,
        "status": "FAILED",
        "projectId": project,
        "runParams": {"execution_type": "TOFU_RUN", "stack_name": "network-prod", "tofu_action": "apply", "provider": "hetzner"},
        "retry_of": "failed-0",
    }))
    monkeypatch.setattr("utils.project_paths.get_project_executions_dir", lambda _: executions)
    created = {}
    monkeypatch.setattr("services.execution_history.create_execution_record", lambda data, project_id, execution_id: created.update(data=data, project_id=project_id, execution_id=execution_id))

    new_id = execution_retry.retry_execution(execution, project_id=project)

    assert new_id
    assert created["project_id"] == project
    assert created["data"]["runParams"]["stack_name"] == "network-prod"
    assert created["data"]["runParams"]["tofu_action"] == "apply"
    assert created["data"]["retry_of"] == execution


def test_retry_policy_uses_stack_policy_and_is_idempotent(monkeypatch, tmp_path):
    from services import retry_policy

    policy = {"project-retry": {"stacks": {"network-prod": {"max_retries": 1, "backoff_seconds": 0}}}}
    monkeypatch.setattr(retry_policy, "load", lambda: policy)
    monkeypatch.setattr(retry_policy, "_store_path", lambda: tmp_path / "retry.json")
    monkeypatch.setattr("utils.project_paths.get_project_executions_dir", lambda _: tmp_path)
    (tmp_path / "failed.json").write_text(json.dumps({
        "id": "failed",
        "status": "FAILED",
        "finishedAt": 1,
        "runParams": {"stack_name": "network-prod"},
    }))
    calls = []
    monkeypatch.setattr(retry_policy, "_chain_depth", lambda *args: 0)
    monkeypatch.setattr("services.execution_retry.retry_execution", lambda *args, **kwargs: calls.append(args) or "new")
    monkeypatch.setattr(retry_policy.time, "time", lambda: 100)

    first = retry_policy.sweep_once()
    second = retry_policy.sweep_once()

    assert first["retried"] == 1
    assert second["retried"] == 0
    assert calls == [("failed",)]
