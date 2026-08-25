"""Tests for global search (UC396)."""

import json
import time
from pathlib import Path

import pytest
import flask

from auth.service import generate_token
from services import global_search, service_catalog, service_instances
from storage import pg
from utils.project_paths import get_project_executions_dir

ORG_A = "org-search-a"
PROJECT_A = "project-search-a"
USER_A = "search-user-a"


def _seed_project(project_id: str, org_id: str, user_id: str) -> None:
    now = time.time()
    pg.execute(
        "INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)",
        (org_id, org_id, user_id, now),
    )
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s,%s)",
        (project_id, org_id, user_id, project_id, "", now, now),
    )
    pg.execute(
        "INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",
        (org_id, user_id, "owner", now),
    )


# No manifest needed; we seed search data directly.


def _headers(user_id: str, data_dir: Path) -> dict[str, str]:
    token = generate_token(user_id, user_id, [], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def data_and_client(data_dir: Path, monkeypatch):
    # Initialize app_context for project paths
    import app_context
    projects_dir = data_dir / "projects"
    projects_dir.mkdir(parents=True, exist_ok=True)
    app_context.set_projects_dir(projects_dir)

    _seed_project(PROJECT_A, ORG_A, USER_A)

    # Create a stack meta entry for search
    now = time.time()
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s,%s,%s)",
        (PROJECT_A, "test-stack", json.dumps({"provider": "bytedc", "env": "dev"})),
    )

    # Create a secret entry
    pg.execute(
        "INSERT INTO stack_secrets (project_id, stack, data) VALUES (%s,%s,%s)",
        (PROJECT_A, "test-stack", json.dumps({"secret_key": "encrypted_value"}).encode("utf-8")),
    )

    # Create an execution file directly
    exec_dir = projects_dir / PROJECT_A / "history" / "executions"
    exec_dir.mkdir(parents=True, exist_ok=True)
    exec_file = exec_dir / "run-123.json"
    exec_data = {
        "id": "run-123",
        "status": "SUCCESS",
        "runParams": {"stack_name": "test-stack", "tofu_action": "apply"},
        "triggeredBy": "user",
        "startedAt": now,
        "finishedAt": now + 10,
    }
    exec_file.write_text(json.dumps(exec_data), encoding="utf-8")

    app = flask.Flask("search-test")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    from api import register_blueprints
    register_blueprints(app)
    client = app.test_client()
    return client, data_dir


def test_search_stacks(data_and_client):
    client, data_dir = data_and_client
    resp = client.get("/api/search?q=test-stack", headers=_headers(USER_A, data_dir))
    assert resp.status_code == 200
    data = resp.get_json()
    assert "stacks" in data
    stacks = data["stacks"]
    assert len(stacks) >= 1
    assert any(s["name"] == "test-stack" for s in stacks)
    # Check that the stack has provider and env
    stack = next(s for s in stacks if s["name"] == "test-stack")
    assert stack["provider"] == "bytedc"
    assert stack["env"] == "dev"


def test_search_runs(data_and_client):
    client, data_dir = data_and_client
    resp = client.get("/api/search?q=run-123", headers=_headers(USER_A, data_dir))
    assert resp.status_code == 200
    data = resp.get_json()
    assert "runs" in data
    runs = data["runs"]
    assert len(runs) >= 1
    assert any(r["id"] == "run-123" for r in runs)
    run = next(r for r in runs if r["id"] == "run-123")
    assert run["stack"] == "test-stack"
    assert run["action"] == "apply"
    assert run["status"] == "SUCCESS"


def test_search_secrets(data_and_client):
    client, data_dir = data_and_client
    resp = client.get("/api/search?q=secret_key", headers=_headers(USER_A, data_dir))
    assert resp.status_code == 200
    data = resp.get_json()
    assert "secrets" in data
    secrets = data["secrets"]
    assert len(secrets) >= 1
    assert any(s["stack"] == "test-stack" for s in secrets)


def test_search_requires_min_length(data_and_client):
    client, data_dir = data_and_client
    resp = client.get("/api/search?q=a", headers=_headers(USER_A, data_dir))
    assert resp.status_code == 400
    assert "error" in resp.get_json()


def test_search_limits_results(data_and_client):
    client, data_dir = data_and_client
    # Create multiple stacks
    for i in range(5):
        pg.execute(
            "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s,%s,%s)",
            (PROJECT_A, f"test-stack-{i}", json.dumps({"provider": "bytedc"})),
        )
    resp = client.get("/api/search?q=test-stack&limit=2", headers=_headers(USER_A, data_dir))
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["stacks"]) <= 2