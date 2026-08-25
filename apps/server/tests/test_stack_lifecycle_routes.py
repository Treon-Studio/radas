from __future__ import annotations

from pathlib import Path

import flask

from api import register_blueprints


def _app(monkeypatch, project_id="project-lifecycle"):
    from api import stack_lifecycle_routes as routes

    app = flask.Flask("stack-lifecycle-tests")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    monkeypatch.setattr(routes, "_get_pid_raw", lambda fallback: project_id)
    return app


def _response(value):
    if isinstance(value, tuple):
        response, status = value
        response.status_code = status
        return response
    return value


def test_rollback_active_lock_preserves_state_and_does_not_enqueue(monkeypatch, tmp_path):
    from api import stack_lifecycle_routes as routes

    stack_dir = tmp_path / "demo"
    stack_dir.mkdir()
    state = stack_dir / "terraform.tfstate"
    state.write_text("before", encoding="utf-8")
    monkeypatch.setattr(routes, "_stack_dir", lambda project_id, name: stack_dir)
    monkeypatch.setattr(routes, "_stack_data_dir", lambda project_id, name: tmp_path / "data")
    import services.cloud_state as cloud_state
    calls = []
    monkeypatch.setattr(routes.cloud_state, "read_lock", lambda *args, **kwargs: calls.append(args) or {"who": "worker", "operation": "apply", "run_id": "run-active"})
    restored = []
    enqueued = []
    monkeypatch.setattr(routes, "restore", lambda *args, **kwargs: restored.append(args) or "snapshot")
    monkeypatch.setattr(routes, "_create_execution", lambda *args, **kwargs: enqueued.append(args) or "run-new")

    app = _app(monkeypatch)
    with app.test_request_context("/api/cloud/stacks/demo/rollback", method="POST", json={"snapshot_id": "snapshot"}):
        response = routes.api_rollback.__wrapped__("demo")

    response = _response(response)
    assert calls, f"lock check was not invoked: {routes.cloud_state.read_lock}"
    assert response.status_code == 409
    assert "worker" in response.get_json()["error"]
    assert state.read_text(encoding="utf-8") == "before"
    assert restored == []
    assert enqueued == []


def test_strip_active_lock_does_not_enqueue(monkeypatch, tmp_path):
    from api import stack_lifecycle_routes as routes

    stack_dir = tmp_path / "demo"
    stack_dir.mkdir()
    monkeypatch.setattr(routes, "_stack_dir", lambda project_id, name: stack_dir)
    monkeypatch.setattr(routes, "_stack_data_dir", lambda project_id, name: tmp_path / "data")
    import services.cloud_state as cloud_state
    monkeypatch.setattr(routes.cloud_state, "read_lock", lambda *args, **kwargs: {"who": "worker", "operation": "destroy", "run_id": "run-active"})
    enqueued = []
    monkeypatch.setattr(routes, "_create_execution", lambda *args, **kwargs: enqueued.append(args) or "run-new")

    app = _app(monkeypatch)
    with app.test_request_context("/api/cloud/stacks/demo/strip", method="POST"):
        response = routes.api_strip.__wrapped__("demo")

    response = _response(response)
    assert response.status_code == 409
    assert enqueued == []


def test_rollback_terminal_lock_is_cleared_and_new_execution_is_locked(monkeypatch, tmp_path):
    from api import stack_lifecycle_routes as routes
    from services import cloud_state

    stack_dir = tmp_path / "demo"
    stack_dir.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(routes, "_stack_dir", lambda project_id, name: stack_dir)
    import services.cloud_provisioning as provisioning
    monkeypatch.setattr(provisioning, "_stack_data_dir", lambda project_id, name: data_dir)
    lock = cloud_state.acquire_lock(data_dir, actor="worker", operation="apply", run_id="run-terminal")["lock"]
    original_read_lock = cloud_state.read_lock
    monkeypatch.setattr(cloud_state, "read_lock", lambda dd, get_execution=None, project_id=None: original_read_lock(dd, lambda run_id, project_id=None: {"status": "SUCCESS"}, project_id))
    monkeypatch.setattr(routes, "restore", lambda *args, **kwargs: "snapshot")
    monkeypatch.setattr(routes, "_create_execution", lambda *args, **kwargs: "run-new")
    acquired = []
    monkeypatch.setattr(cloud_state, "acquire_lock", lambda *args, **kwargs: acquired.append(kwargs) or {"ok": True, "lock": {"run_id": "run-new"}})

    app = _app(monkeypatch)
    with app.test_request_context("/api/cloud/stacks/demo/rollback", method="POST", json={"snapshot_id": "snapshot"}):
        response = routes.api_rollback.__wrapped__("demo")

    assert response.get_json()["execution_id"] == "run-new"
    assert response.status_code == 200
    assert acquired[0]["run_id"] == "run-new"
    assert acquired[0]["operation"] == "apply"
