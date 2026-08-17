"""HTTP contract tests for the project-scoped test-case API."""
from __future__ import annotations

import time
from pathlib import Path

import flask

from auth import middleware
from auth.service import generate_token
from storage import pg
from services.org_service import create_org
from api.test_case_routes import bp


def _seed_projects():
    for uid, username in (("u1", "alice"), ("u2", "bob")):
        pg.execute(
            "INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)",
            (uid, username, "x"),
        )
    org_a = create_org("Org A", "u1")
    org_b = create_org("Org B", "u2")
    for project_id, org, owner in (("project-a", org_a, "u1"), ("project-b", org_b, "u2")):
        pg.execute(
            "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) "
            "VALUES (%s,%s,%s,%s,%s,0,%s)",
            (project_id, org["id"], owner, project_id, "", time.time()),
        )
    return org_a, org_b


def _token(uid: str, username: str) -> str:
    return generate_token(uid, username, ["admin"], Path("/tmp"), token_type="access")


def _app():
    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    return app


def _headers(project_id: str, uid: str = "u1", username: str = "alice"):
    return {
        "X-Project-Id": project_id,
        "Authorization": f"Bearer {_token(uid, username)}",
    }


def test_crud_and_clone_routes_are_project_scoped(pg_db, data_dir):
    _seed_projects()
    client = _app().test_client()

    created = client.post(
        "/api/tests",
        json={"name": "Security", "stack": "demo", "assertions": ["cidr_public"], "tags": ["security"]},
        headers=_headers("project-a"),
    )
    assert created.status_code == 201, created.data
    test_id = created.get_json()["test_case"]["id"]

    assert client.get("/api/tests", headers=_headers("project-b", "u2", "bob")).get_json()["test_cases"] == []
    assert client.patch(f"/api/tests/{test_id}", json={"name": "Updated"}, headers=_headers("project-b", "u2", "bob")).status_code == 404

    cloned = client.post(f"/api/tests/{test_id}/clone", headers=_headers("project-a"))
    assert cloned.status_code == 201
    assert cloned.get_json()["test_case"]["name"] == "Security (copy)"
    assert client.delete(f"/api/tests/{test_id}", headers=_headers("project-a")).status_code == 200


def test_test_case_list_paginates_with_metadata(pg_db, data_dir):
    _seed_projects()
    client = _app().test_client()
    for name in ("one", "two", "three"):
        response = client.post("/api/tests", json={"name": name, "stack": "demo", "assertions": ["cidr_public"]}, headers=_headers("project-a"))
        assert response.status_code == 201
    response = client.get("/api/tests?limit=2&offset=1", headers=_headers("project-a"))
    body = response.get_json()
    assert [item["name"] for item in body["test_cases"]] == ["two", "three"]
    assert body["has_more"] is False
    assert body["next_offset"] is None


def test_list_filters_by_tag_environment_enabled_and_kind(pg_db, data_dir):
    _seed_projects()
    client = _app().test_client()
    for payload in (
        {"name": "Security prod", "stack": "demo", "assertions": ["cidr_public"], "tags": ["security"], "parameters": {"env": "prod"}},
        {"name": "Cost dev", "stack": "demo", "assertions": ["budget_exceeded"], "tags": ["cost"], "parameters": {"env": "dev"}, "enabled": False},
    ):
        assert client.post("/api/tests", json=payload, headers=_headers("project-a")).status_code == 201
    response = client.get("/api/tests?tag=security&environment=prod&enabled=true&kind=assertion", headers=_headers("project-a"))
    assert response.status_code == 200
    assert [item["name"] for item in response.get_json()["test_cases"]] == ["Security prod"]


def test_batch_route_accepts_bounded_concurrency(pg_db, data_dir, monkeypatch):
    _seed_projects()
    client = _app().test_client()
    created = client.post(
        "/api/tests", json={"name": "Batch", "stack": "demo", "assertions": ["cidr_public"]},
        headers=_headers("project-a"),
    ).get_json()["test_case"]
    monkeypatch.setattr("services.test_cases._stack_texts", lambda project_id, stack: {"tfvars": ""})
    response = client.post("/api/tests/batch-run", json={"stack": "demo", "concurrency": 99}, headers=_headers("project-a"))
    assert response.status_code == 201
    assert response.get_json()["concurrency"] == 8
    assert response.get_json()["results"][0]["test_id"] == created["id"]


def test_route_validation_disabled_batch_and_history(pg_db, data_dir, monkeypatch):
    _seed_projects()
    client = _app().test_client()

    assert client.post("/api/tests", json={"name": "bad"}, headers=_headers("project-a")).status_code == 400
    created = client.post(
        "/api/tests",
        json={"name": "Disabled", "stack": "demo", "assertions": ["cidr_public"], "enabled": False},
        headers=_headers("project-a"),
    ).get_json()["test_case"]
    assert client.post(f"/api/tests/{created['id']}/run", headers=_headers("project-a")).status_code == 400

    enabled = client.post(
        "/api/tests",
        json={"name": "Enabled", "stack": "demo", "assertions": ["cidr_public"]},
        headers=_headers("project-a"),
    ).get_json()["test_case"]
    monkeypatch.setattr("services.test_cases._stack_texts", lambda project_id, stack: {"tfvars": ""})
    batch = client.post("/api/tests/batch-run", json={"stack": "demo"}, headers=_headers("project-a"))
    assert batch.status_code == 201
    assert batch.get_json()["count"] == 1

    history = client.get(f"/api/tests/{enabled['id']}/history", headers=_headers("project-a"))
    assert history.status_code == 200
    assert len(history.get_json()["results"]) == 1
    assert client.get(f"/api/tests/{enabled['id']}/history", headers=_headers("project-b", "u2", "bob")).get_json()["results"] == []


def test_clone_route_cannot_cross_project(pg_db, data_dir):
    _seed_projects()
    client = _app().test_client()
    created = client.post(
        "/api/tests",
        json={"name": "Only A", "stack": "demo", "assertions": ["cidr_public"]},
        headers=_headers("project-a"),
    ).get_json()["test_case"]
    response = client.post(
        f"/api/tests/{created['id']}/clone",
        headers=_headers("project-b", "u2", "bob"),
    )
    assert response.status_code == 404


def test_results_export_has_stable_run_id(pg_db, data_dir, monkeypatch):
    _seed_projects()
    client = _app().test_client()
    created = client.post(
        "/api/tests", json={"name": "Export", "stack": "demo", "assertions": ["cidr_public"]},
        headers=_headers("project-a"),
    ).get_json()["test_case"]
    monkeypatch.setattr("services.test_cases._stack_texts", lambda project_id, stack: {"tfvars": ""})
    run = client.post(f"/api/tests/{created['id']}/run", headers=_headers("project-a"))
    assert run.status_code == 201
    result = run.get_json()["result"]
    assert result["run_id"]
    exported = client.get("/api/tests/results/export", headers=_headers("project-a"))
    assert exported.status_code == 200
    body = exported.get_json()
    assert body["format"] == "json"
    assert body["schema_version"] == "test-results.v1"
    assert body["count"] == 1
    assert body["project_id"] == "project-a"
    assert body["results"][0]["run_id"] == result["run_id"]


def test_routes_require_project_membership(pg_db):
    _seed_projects()
    client = _app().test_client()
    response = client.get("/api/tests", headers=_headers("project-a", "u2", "bob"))
    assert response.status_code == 403
