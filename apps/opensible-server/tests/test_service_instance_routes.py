"""HTTP contract tests for project-scoped service instances."""
from __future__ import annotations

import time
from pathlib import Path

import flask
import pytest

from auth.service import generate_token
from services import service_catalog
from storage import pg


ORG_A = "org-service-a"
ORG_B = "org-service-b"
PROJECT_A = "project-service-a"
PROJECT_B = "project-service-b"
USER_A = "service-user-a"
USER_B = "service-user-b"


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


def _manifest() -> dict:
    return {
        "schema_version": 1,
        "slug": "route-demo",
        "name": "Route Demo Service",
        "version": "1.0.0",
        "category": "web",
        "summary": "A harmless service used by route tests",
        "runtime": "container",
        "image": "example/route-demo:1.2.3",
        "production_ready": False,
        "persistence": "stateless",
        "inputs": [
            {"name": "memory_mb", "type": "integer", "default": 256, "min": 128, "max": 4096},
            {"name": "mode", "type": "enum", "choices": ["safe", "fast"], "default": "safe"},
        ],
        "secrets": [{"name": "admin_password", "required": False}],
        "storage": [],
        "ports": [{"name": "http", "port": 8080, "public": True}],
        "endpoints": [{"name": "endpoint", "port": "http", "path": "/", "public": True}],
        "healthcheck": {"path": "/healthz", "port": 8080, "interval_seconds": 30},
        "lifecycle": {"start": True, "stop": True, "restart": True, "update": True, "rollback": True, "destroy": True},
        "dependencies": [],
        "outputs": ["endpoint"],
        "supported_runtimes": ["docker"],
        "minimum_resources": {"cpu_millicores": 100, "memory_mb": 256, "storage_gb": 0},
    }


@pytest.fixture
def client(data_dir: Path, monkeypatch):
    from auth import middleware
    from api.service_instance_routes import bp

    middleware.set_data_dir(data_dir)
    _seed_project(PROJECT_A, ORG_A, USER_A)
    _seed_project(PROJECT_B, ORG_B, USER_B)
    service_catalog.publish_definition(_manifest(), USER_A, None, scope="platform")
    app = flask.Flask("service-instance-routes")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    app.register_blueprint(bp)
    return app.test_client()


def _headers(user_id: str, data_dir: Path, **extra: str) -> dict[str, str]:
    token = generate_token(user_id, user_id, [], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}", **extra}


def _create(client, data_dir: Path, **overrides):
    payload = {
        "name": "demo",
        "environment": "development",
        "catalog_slug": "route-demo",
        "catalog_version": "1.0.0",
        "runtime_id": "mock",
        "spec": {"mode": "safe"},
    }
    payload.update(overrides)
    return client.post(
        f"/api/projects/{PROJECT_A}/services",
        json=payload,
        headers=_headers(USER_A, data_dir),
    )


def test_auth_membership_and_cross_tenant_isolation(client, data_dir):
    assert client.get(f"/api/projects/{PROJECT_A}/services").status_code == 401
    denied = client.get(
        f"/api/projects/{PROJECT_A}/services",
        headers=_headers(USER_B, data_dir),
    )
    assert denied.status_code == 403
    assert "Access denied" in denied.get_json()["error"]
    assert client.get(
        f"/api/projects/{PROJECT_B}/services",
        headers=_headers(USER_B, data_dir),
    ).get_json()["data"]["services"] == []


def test_create_list_detail_envelopes_and_redaction(client, data_dir):
    response = _create(client, data_dir, spec={"mode": "safe", "admin_password": "raw-secret"})
    assert response.status_code == 201
    body = response.get_json()
    assert set(body) == {"data", "request_id"}
    service = body["data"]["service"]
    assert service["status"] == "draft"
    assert "raw-secret" not in str(body)
    service_id = service["id"]

    listing = client.get(
        f"/api/projects/{PROJECT_A}/services",
        headers=_headers(USER_A, data_dir),
    )
    assert listing.status_code == 200
    assert listing.get_json()["data"]["services"][0]["id"] == service_id
    detail = client.get(
        f"/api/projects/{PROJECT_A}/services/{service_id}",
        headers=_headers(USER_A, data_dir),
    )
    assert detail.status_code == 200
    assert detail.get_json()["data"]["service"]["revision"]["revision_number"] == 1


def test_catalog_runtime_and_spec_validation(client, data_dir):
    bad_catalog = _create(client, data_dir, catalog_slug="missing")
    assert bad_catalog.status_code == 422
    assert bad_catalog.get_json()["error"]["code"] == "SERVICE_VALIDATION_FAILED"
    bad_runtime = _create(client, data_dir, runtime_id="kubernetes")
    assert bad_runtime.status_code == 422
    assert bad_runtime.get_json()["error"]["code"] == "RUNTIME_UNSUPPORTED"
    bad_spec = _create(client, data_dir, spec={"unexpected": True})
    assert bad_spec.status_code == 422
    assert bad_spec.get_json()["error"]["code"] == "SERVICE_VALIDATION_FAILED"


def test_project_org_mismatch_and_duplicate_name(client, data_dir):
    mismatch = _create(client, data_dir, org_id=ORG_B)
    assert mismatch.status_code == 403
    assert mismatch.get_json()["error"]["code"] == "FORBIDDEN"
    assert _create(client, data_dir).status_code == 201
    duplicate = _create(client, data_dir)
    assert duplicate.status_code == 409
    assert duplicate.get_json()["error"]["code"] == "SERVICE_NAME_CONFLICT"


def test_patch_creates_immutable_revision(client, data_dir):
    created = _create(client, data_dir).get_json()["data"]["service"]
    response = client.patch(
        f"/api/projects/{PROJECT_A}/services/{created['id']}",
        json={"spec": {"mode": "fast", "memory_mb": 1024}},
        headers=_headers(USER_A, data_dir),
    )
    assert response.status_code == 200
    revision = response.get_json()["data"]["revision"]
    assert revision["revision_number"] == 2
    assert response.get_json()["data"]["service"]["desired_revision_id"] == revision["id"]
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_revisions WHERE instance_id = %s", (created["id"],))["count"] == 2


def test_lifecycle_is_queued_idempotent_and_does_not_execute_provider(client, data_dir, monkeypatch):
    from api import service_instance_routes as routes

    created = _create(client, data_dir).get_json()["data"]["service"]

    class Registry:
        def capabilities(self, runtime_id):
            assert runtime_id == "mock"
            return {name: True for name in ("deploy", "start", "stop", "restart", "destroy")}

        def __getattr__(self, name):
            raise AssertionError(f"provider execution must not happen: {name}")

    monkeypatch.setattr(routes, "_RUNTIME_REGISTRY", Registry())
    headers = {**_headers(USER_A, data_dir), "Idempotency-Key": "deploy-1"}
    first = client.post(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations/deploy",
        headers=headers,
    )
    assert first.status_code == 202
    operation = first.get_json()["operation"]
    assert operation["status"] == "queued"
    assert operation["poll_url"].endswith(f"/operations/{operation['id']}")
    retry = client.post(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations/deploy",
        headers=headers,
    )
    assert retry.status_code == 202
    assert retry.get_json()["operation"]["id"] == operation["id"]


def test_operation_conflict_destroy_confirmation_and_capability_rejection(client, data_dir, monkeypatch):
    from api import service_instance_routes as routes

    created = _create(client, data_dir).get_json()["data"]["service"]
    base = {**_headers(USER_A, data_dir), "Idempotency-Key": "lifecycle-1"}
    missing = client.post(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations/destroy",
        headers=base,
    )
    assert missing.status_code == 400
    assert missing.get_json()["error"]["code"] == "SERVICE_CONFIRMATION_REQUIRED"

    class LimitedRegistry:
        def capabilities(self, runtime_id):
            return {"deploy": True, "start": False, "stop": False, "restart": False, "destroy": False}

    monkeypatch.setattr(routes, "_RUNTIME_REGISTRY", LimitedRegistry())
    unsupported = client.post(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations/start",
        headers={**_headers(USER_A, data_dir), "Idempotency-Key": "start-1"},
    )
    assert unsupported.status_code == 422
    assert unsupported.get_json()["error"]["code"] == "RUNTIME_UNSUPPORTED"

    monkeypatch.setattr(routes, "_RUNTIME_REGISTRY", type("R", (), {"capabilities": lambda self, _: {"deploy": True, "destroy": True}})())
    queued = client.post(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations/destroy",
        json={"confirm": True},
        headers=base,
    )
    assert queued.status_code == 202
    conflict = client.post(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations/restart",
        headers={**_headers(USER_A, data_dir), "Idempotency-Key": "restart-1"},
    )
    assert conflict.status_code == 409
    assert conflict.get_json()["error"]["code"] == "SERVICE_OPERATION_CONFLICT"


def test_impact_and_operations_are_project_scoped(client, data_dir):
    created = _create(client, data_dir).get_json()["data"]["service"]
    headers = {**_headers(USER_A, data_dir), "Idempotency-Key": "impact-deploy"}
    client.post(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations/deploy",
        headers=headers,
    )
    operations = client.get(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations",
        headers=_headers(USER_A, data_dir),
    )
    assert operations.status_code == 200
    assert operations.get_json()["data"]["operations"][0]["kind"] == "service.deploy"
    impact = client.get(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/impact",
        headers=_headers(USER_A, data_dir),
    )
    assert impact.status_code == 200
    assert impact.get_json()["data"]["impact"]["project_id"] == PROJECT_A
    hidden = client.get(
        f"/api/projects/{PROJECT_B}/services/{created['id']}",
        headers=_headers(USER_B, data_dir),
    )
    assert hidden.status_code == 404
