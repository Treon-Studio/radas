from __future__ import annotations

import json
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
        path.write_text(json.dumps(config), encoding="utf-8")

    monkeypatch.setattr(projects_routes, "save_project_config", save_config)
    app = Flask(__name__)
    with app.test_request_context("/api/projects", method="POST", json=payload) as context:
        context.request.current_user = {"user_id": user_id}
        response = projects_routes.api_create_project.__wrapped__()
    return response, project_root


def test_list_fails_closed_when_project_lookup_fails(monkeypatch, tmp_path, pg_db):
    from api import projects_routes

    monkeypatch.setattr(
        projects_routes,
        "load_projects",
        lambda strict=False: (_ for _ in ()).throw(RuntimeError("database unavailable")),
    )
    app = Flask(__name__)
    with app.test_request_context("/api/projects", method="GET") as context:
        context.request.current_user = {"user_id": "u1"}
        response = projects_routes.api_list_projects.__wrapped__()

    assert response[1] == 500
    body = response[0].get_json()
    assert body["error"]["code"] == "PROJECTS_LOOKUP_FAILED"
    assert body["request_id"]


def test_list_fails_closed_when_org_lookup_fails(monkeypatch, tmp_path, pg_db):
    from api import projects_routes

    monkeypatch.setattr(projects_routes, "load_projects", lambda strict=False: [{"id": "p1", "org_id": "org-a"}])
    monkeypatch.setattr(
        "services.org_service.list_orgs_for_user",
        lambda _uid: (_ for _ in ()).throw(RuntimeError("database unavailable")),
    )
    app = Flask(__name__)
    with app.test_request_context("/api/projects", method="GET") as context:
        context.request.current_user = {"user_id": "u1"}
        response = projects_routes.api_list_projects.__wrapped__()

    assert response[1] == 503
    body = response[0].get_json()
    assert body["error"]["code"] == "ORG_LOOKUP_FAILED"
    assert body["request_id"]


def test_create_fails_closed_when_org_lookup_fails(monkeypatch, tmp_path, pg_db):
    from api import projects_routes

    monkeypatch.setattr(
        "services.org_service.list_orgs_for_user",
        lambda _uid: (_ for _ in ()).throw(RuntimeError("database unavailable")),
    )
    response, project_root = _invoke_create(monkeypatch, tmp_path, {"name": "outage"})

    assert response[1] == 503
    body = response[0].get_json()
    assert body["error"]["code"] == "ORG_LOOKUP_FAILED"
    assert body["request_id"]
    assert config_db.list_projects(tmp_path) == []
    assert list(project_root.iterdir()) == []


def test_create_response_preserves_project_aliases(monkeypatch, tmp_path, pg_db):
    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", ("u1", "alice", "x"))
    from services.org_service import create_org

    org = create_org("Own", "u1")
    response, _ = _invoke_create(monkeypatch, tmp_path, {"name": "aliases"})

    assert response.status_code == 200
    project = response.get_json()["project"]
    assert project["orgId"] == org["id"]
    assert project["createdBy"] == "u1"
    stored = config_db.list_projects(tmp_path)[0]
    assert stored["orgId"] == org["id"]
    assert stored["createdBy"] == "u1"


def test_create_reports_filesystem_rollback_failure(monkeypatch, tmp_path, pg_db):
    from services.org_service import create_org
    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", ("u1", "alice", "x"))
    create_org("Own", "u1")
    from api import projects_routes

    project_root = tmp_path / "projects"
    project_root.mkdir()
    monkeypatch.setattr(projects_routes, "DATA_DIR", tmp_path)
    monkeypatch.setattr(projects_routes, "get_project_dir", lambda project_id: project_root / project_id)
    monkeypatch.setattr(projects_routes, "create_minimal_ansible_config", lambda _path: (_ for _ in ()).throw(OSError("setup failed")))
    monkeypatch.setattr(projects_routes.shutil, "rmtree", lambda _path: (_ for _ in ()).throw(OSError("cleanup failed")))
    app = Flask(__name__)
    with app.test_request_context("/api/projects", method="POST", json={"name": "cleanup"}) as context:
        context.request.current_user = {"user_id": "u1"}
        response = projects_routes.api_create_project.__wrapped__()

    assert response[1] == 500
    assert "rollback failed" in response[0].get_json()["error"]
    assert config_db.list_projects(tmp_path) == []


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
    from services.org_service import create_org
    create_org("Own", "u1")

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


def test_legacy_replace_preserves_concurrent_atomic_insert(pg_db):
    initial = {
        "id": "initial",
        "name": "initial",
        "description": "before",
        "org_id": None,
        "owner_id": "u1",
        "isArchived": False,
    }
    config_db.create_project(Path("/tmp"), initial)
    snapshot = config_db.list_projects(Path("/tmp"))
    inserted = {
        "id": "atomic",
        "name": "atomic",
        "description": "concurrent",
        "org_id": None,
        "owner_id": "u1",
        "isArchived": False,
    }
    config_db.create_project(Path("/tmp"), inserted)
    snapshot[0]["description"] = "updated"

    assert config_db.replace_all_projects(Path("/tmp"), snapshot) is True
    projects = {project["id"]: project for project in config_db.list_projects(Path("/tmp"))}
    assert projects["initial"]["description"] == "updated"
    assert projects["atomic"]["description"] == "concurrent"


def test_replace_does_not_overwrite_newer_fields_or_resurrect_delete(pg_db):
    initial = {
        "id": "stale", "name": "stale", "description": "before",
        "org_id": None, "owner_id": "u1", "isArchived": False,
    }
    config_db.create_project(Path("/tmp"), initial)
    snapshot = config_db.list_projects(Path("/tmp"))
    config_db.update_project("stale", {"description": "newer"})
    snapshot[0]["description"] = "legacy edit"
    assert config_db.replace_all_projects(Path("/tmp"), snapshot) is True
    assert config_db.get_project("stale")["description"] == "newer"

    deleted_snapshot = config_db.list_projects(Path("/tmp"))
    assert config_db.delete_project("stale") is True
    deleted_snapshot[0]["description"] = "must not resurrect"
    assert config_db.replace_all_projects(Path("/tmp"), deleted_snapshot) is True
    assert config_db.get_project("stale") is None


def test_update_route_maps_duplicate_name_to_400(monkeypatch, tmp_path, pg_db):
    first = {"id": "one", "name": "one", "description": "", "org_id": None, "owner_id": "u1", "isArchived": False}
    second = {"id": "two", "name": "two", "description": "", "org_id": None, "owner_id": "u1", "isArchived": False}
    config_db.create_project(tmp_path, first)
    config_db.create_project(tmp_path, second)
    from api import projects_routes
    app = Flask(__name__)
    with app.test_request_context("/api/projects/two", method="PUT", json={"name": "one"}, headers={"X-Internal-Call": "test-internal-call-secret-at-least-32-chars"}):
        request = __import__("flask").request
        request.current_user = {"user_id": "u1"}
        response = projects_routes.api_update_project.__wrapped__("two")
    assert response[1] == 400
    assert response[0].get_json()["error"] == "Project with this name already exists"


def test_restore_route_maps_duplicate_name_to_400(monkeypatch, tmp_path, pg_db):
    config_db.create_project(tmp_path, {"id": "one", "name": "one", "description": "", "org_id": None, "owner_id": "u1", "isArchived": False})
    config_db.create_project(tmp_path, {"id": "two", "name": "two", "description": "", "org_id": None, "owner_id": "u1", "isArchived": True})
    pg.execute("UPDATE projects SET name = %s WHERE id = %s", ("one", "two"))
    from api import projects_routes
    app = Flask(__name__)
    with app.test_request_context("/api/projects/two/restore", method="POST"):
        request = __import__("flask").request
        request.current_user = {"user_id": "u1"}
        response = projects_routes.api_restore_project.__wrapped__("two")
    assert response[1] == 400
    assert response[0].get_json()["error"] == "Project with this name already exists"


def test_create_rejects_user_without_org_membership(monkeypatch, tmp_path, pg_db):
    response, project_root = _invoke_create(monkeypatch, tmp_path, {"name": "unscoped"})
    assert response[1] == 403
    assert "organization membership is required" in response[0].get_json()["error"]
    assert config_db.list_projects(tmp_path) == []
    assert list(project_root.iterdir()) == []


def test_concurrent_field_updates_merge_without_lost_updates(pg_db):
    config_db.create_project(Path("/tmp"), {
        "id": "merge", "name": "merge", "description": "before",
        "org_id": None, "owner_id": "u1", "isArchived": False,
    })
    barrier = threading.Barrier(2)
    results = []

    def update(values):
        barrier.wait()
        results.append(config_db.update_project("merge", values))

    threads = [
        threading.Thread(target=update, args=({"description": "description edit"},)),
        threading.Thread(target=update, args=({"isArchived": True},)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    project = config_db.get_project("merge")
    assert project["description"] == "description edit"
    assert project["isArchived"] is True
    assert len(results) == 2


def test_concurrent_replace_and_update_preserve_newer_field(pg_db):
    config_db.create_project(Path("/tmp"), {
        "id": "replace-race", "name": "replace-race", "description": "before",
        "org_id": None, "owner_id": "u1", "isArchived": False,
    })
    snapshot = config_db.list_projects(Path("/tmp"))
    snapshot[0]["description"] = "stale replacement"
    barrier = threading.Barrier(2)

    def replace():
        barrier.wait()
        assert config_db.replace_all_projects(Path("/tmp"), snapshot) is True

    def update():
        barrier.wait()
        config_db.update_project("replace-race", {"description": "newer update"})

    threads = [threading.Thread(target=replace), threading.Thread(target=update)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert config_db.get_project("replace-race")["description"] == "newer update"


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
