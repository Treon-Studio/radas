from __future__ import annotations

import threading
import uuid
from pathlib import Path

import pytest
from flask import Flask

from storage import config_db, pg


def _invoke_create(monkeypatch, tmp_path, payload, user_id="u1", config_creator=None):
    from api import projects_routes

    project_root = tmp_path / "projects"
    project_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(projects_routes, "DATA_DIR", tmp_path)
    monkeypatch.setattr(projects_routes, "get_project_dir", lambda project_id: project_root / project_id)
    monkeypatch.setattr(
        projects_routes,
        "create_minimal_ansible_config",
        config_creator or (lambda path: True),
    )

    def save_config(project_id, config):
        path = project_root / project_id / "project.json"
        path.write_text(__import__("json").dumps(config), encoding="utf-8")

    monkeypatch.setattr(projects_routes, "save_project_config", save_config)
    app = Flask(__name__)
    with app.test_request_context("/api/projects", method="POST", json=payload) as context:
        context.request.current_user = {"user_id": user_id}
        response = projects_routes.api_create_project.__wrapped__()
    return response, project_root


def test_create_rejects_unauthorized_requested_org_without_project(monkeypatch, tmp_path, pg_db):
    from services.org_service import create_org

    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", ("u1", "alice", "x"))
    own_org = create_org("Own", "u1")
    response, project_root = _invoke_create(
        monkeypatch,
        tmp_path,
        {"name": "cross-tenant", "org_id": str(uuid.uuid4())},
    )

    assert response[1] == 403
    assert response[0].get_json() == {"success": False, "error": "Organization access denied"}
    assert config_db.list_projects(tmp_path) == []
    assert list(project_root.iterdir()) == []
    assert own_org["id"]


def test_create_rolls_back_filesystem_when_setup_fails(monkeypatch, tmp_path, pg_db):
    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", ("u1", "alice", "x"))

    def fail_config(_path):
        raise OSError("injected setup failure")

    response, project_root = _invoke_create(
        monkeypatch,
        tmp_path,
        {"name": "atomic-failure"},
        config_creator=fail_config,
    )

    assert response[1] == 500
    assert "injected setup failure" in response[0].get_json()["error"]
    assert config_db.list_projects(tmp_path) == []
    assert list(project_root.iterdir()) == []


def test_create_project_store_preserves_concurrent_inserts(pg_db):
    barrier = threading.Barrier(2)
    results = []

    def create(index):
        project = {
            "id": f"concurrent-{index}",
            "org_id": None,
            "owner_id": "u1",
            "name": f"concurrent-{index}",
            "description": "",
            "createdAt": float(index),
            "isArchived": False,
        }
        barrier.wait()
        results.append(config_db.create_project(Path("/tmp"), project))

    threads = [threading.Thread(target=create, args=(index,)) for index in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert {project["id"] for project in results} == {"concurrent-0", "concurrent-1"}
    assert {project["name"] for project in config_db.list_projects(Path("/tmp"))} == {
        "concurrent-0",
        "concurrent-1",
    }
