"""Fail-closed blocker gate regressions."""
from __future__ import annotations

from pathlib import Path

import flask


def test_state_lock_is_exclusive_and_owner_checked(tmp_path):
    from services.cloud_state import acquire_lock, release_lock, read_lock
    dd = Path(tmp_path) / "stack-data"
    first = acquire_lock(dd, actor="alice", operation="apply")
    assert first["ok"] is True
    second = acquire_lock(dd, actor="bob", operation="apply")
    assert second["ok"] is False
    assert second["lock"]["who"] == "alice"
    wrong = release_lock(dd, lock_id="wrong", actor="bob")
    assert wrong["ok"] is False
    assert read_lock(dd)["who"] == "alice"
    released = release_lock(dd, lock_id=first["lock"]["id"], actor="alice")
    assert released["released"] is True


def test_blocker_evaluation_error_refuses_mutating_action(monkeypatch, tmp_path):
    from services import cloud_provisioning as cloud

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    monkeypatch.setattr(cloud, "_get_project_id", lambda: "project-a")
    monkeypatch.setattr(cloud, "_stack_dir", lambda project_id, name: tmp_path / name)
    (tmp_path / "demo").mkdir()
    monkeypatch.setattr(
        "services.test_cases.latest_failed_blocker",
        lambda project_id, stack: (_ for _ in ()).throw(RuntimeError("database unavailable")),
    )
    enqueued = []
    monkeypatch.setattr(cloud, "_create_execution", lambda *args, **kwargs: enqueued.append(args) or "run-1")

    app.register_blueprint(cloud.bp)
    with app.test_request_context(
        "/api/cloud/stacks/demo/actions",
        method="POST",
        json={"action": "apply"},
        headers={"X-Project-Id": "project-a"},
    ):
        response = cloud.stacks_action.__wrapped__("demo")

    assert response[1] == 503
    assert enqueued == []


def test_stack_actions_derive_organization_for_feature_flag_enforcement(monkeypatch, tmp_path):
    from services import cloud_provisioning as cloud

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    monkeypatch.setattr(cloud, "_get_project_id", lambda: "project-a")
    monkeypatch.setattr(cloud, "_stack_dir", lambda project_id, name: tmp_path / name)
    monkeypatch.setattr("auth.middleware._org_id_of_project", lambda project_id: "org-a")
    (tmp_path / "demo").mkdir()
    evaluations = []
    monkeypatch.setattr(
        "services.feature_flag_registry.evaluate",
        lambda *args, **kwargs: evaluations.append(kwargs) or {"enabled": True, "reason": "full_rollout"},
    )

    app.register_blueprint(cloud.bp)
    with app.test_request_context(
        "/api/cloud/stacks/demo/actions",
        method="POST",
        json={"action": "apply"},
        headers={"X-Project-Id": "project-a"},
    ):
        response = cloud.stacks_action.__wrapped__("demo")

    assert response[1] == 423
    assert evaluations[0]["project_id"] == "project-a"
    assert evaluations[0]["org_id"] == "org-a"
