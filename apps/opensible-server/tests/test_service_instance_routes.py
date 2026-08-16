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
            {"name": "enabled", "type": "boolean", "default": False},
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
    from api import register_blueprints

    middleware.set_data_dir(data_dir)
    _seed_project(PROJECT_A, ORG_A, USER_A)
    _seed_project(PROJECT_B, ORG_B, USER_B)
    service_catalog.publish_definition(_manifest(), USER_A, None, scope="platform")
    app = flask.Flask("service-instance-routes")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    return app.test_client()


def _headers(user_id: str, data_dir: Path, **extra: str) -> dict[str, str]:
    token = generate_token(user_id, user_id, [], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}", **extra}


def _role_headers(user_id: str, data_dir: Path, roles: list[str]) -> dict[str, str]:
    token = generate_token(user_id, user_id, roles, data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}"}


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
    missing = client.get(f"/api/projects/{PROJECT_A}/services")
    assert missing.status_code == 401
    assert missing.get_json()["error"]["code"] == "UNAUTHORIZED"
    assert missing.get_json()["error"]["details"] == {}
    assert missing.get_json()["request_id"] == missing.headers["X-Request-ID"]
    invalid = client.get(
        f"/api/projects/{PROJECT_A}/services",
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert invalid.status_code == 401
    assert invalid.get_json()["error"]["code"] == "UNAUTHORIZED"
    denied = client.get(
        f"/api/projects/{PROJECT_A}/services",
        headers=_headers(USER_B, data_dir),
    )
    assert denied.status_code == 403
    assert denied.get_json()["error"]["code"] == "FORBIDDEN"
    assert denied.get_json()["request_id"] == denied.headers["X-Request-ID"]
    readonly = client.post(
        f"/api/projects/{PROJECT_A}/services",
        json={},
        headers=_role_headers(USER_A, data_dir, ["readonly"]),
    )
    assert readonly.status_code == 403
    assert readonly.get_json()["error"]["code"] == "READ_ONLY"
    unknown = client.get(
        "/api/projects/unknown-project/services",
        headers=_headers(USER_A, data_dir),
    )
    assert unknown.status_code == 404
    assert unknown.get_json()["error"]["code"] == "PROJECT_NOT_FOUND"
    wrong_method = client.put(
        f"/api/projects/{PROJECT_A}/services",
        headers=_headers(USER_A, data_dir),
    )
    assert wrong_method.status_code == 405
    assert wrong_method.get_json()["error"]["code"] == "METHOD_NOT_ALLOWED"
    assert wrong_method.get_json()["request_id"] == wrong_method.headers["X-Request-ID"]
    assert client.get(
        f"/api/projects/{PROJECT_B}/services",
        headers=_headers(USER_B, data_dir),
    ).get_json()["data"]["services"] == []


def test_create_rejects_raw_secret_values_without_persisting(client, data_dir):
    response = _create(client, data_dir, spec={"mode": "safe", "admin_password": "raw-secret"})
    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "SERVICE_VALIDATION_FAILED"
    assert "raw-secret" not in response.get_data(as_text=True)
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_instances")["count"] == 0


def test_create_rejects_explicit_null_for_optional_declared_secret(client, data_dir):
    response = _create(client, data_dir, spec={"mode": "safe", "admin_password": None})
    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "SERVICE_VALIDATION_FAILED"
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_instances")["count"] == 0


def test_create_rejects_duplicate_top_level_and_nested_secret_declarations(client, data_dir):
    response = _create(
        client,
        data_dir,
        spec={
            "mode": "safe",
            "admin_password": "secret://vault/admin",
            "secrets": {"admin_password": {"secret_ref": "secret://vault/admin"}},
        },
    )
    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "SERVICE_VALIDATION_FAILED"
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_instances")["count"] == 0


def test_secret_references_are_canonicalized_and_nested_values_are_rejected(client, data_dir):
    response = _create(
        client,
        data_dir,
        spec={"mode": "safe", "secrets": {"admin_password": {"secret_ref": "secret://vault/admin"}}},
    )
    assert response.status_code == 201
    service = response.get_json()["data"]["service"]
    revision = service["revision"]
    assert revision["spec"]["secrets"] == {"admin_password": {"secret_ref": "secret://vault/admin"}}
    stored = pg.query_one("SELECT spec, redacted_spec FROM service_revisions WHERE id = %s", (revision["id"],))
    assert stored["spec"]["secrets"] == {"admin_password": {"secret_ref": "secret://vault/admin"}}
    assert "raw-secret" not in str(stored)

    undeclared = _create(
        client,
        data_dir,
        name="undeclared",
        spec={"mode": "safe", "secrets": {"other": {"secret_ref": "secret://vault/other"}}},
    )
    assert undeclared.status_code == 422
    assert undeclared.get_json()["error"]["code"] == "SERVICE_VALIDATION_FAILED"

    raw_nested = _create(
        client,
        data_dir,
        name="raw-nested",
        spec={"mode": "safe", "secrets": {"admin_password": {"secret_ref": "raw-secret"}}},
    )
    assert raw_nested.status_code == 422
    assert "raw-secret" not in raw_nested.get_data(as_text=True)


def test_create_list_detail_envelopes_and_redaction(client, data_dir):
    response = _create(client, data_dir)
    assert response.status_code == 201
    body = response.get_json()
    assert set(body) == {"data", "request_id"}
    service = body["data"]["service"]
    assert service["status"] == "draft"
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


def test_provider_validation_rejection_does_not_insert_operation(client, data_dir, monkeypatch):
    from api import service_instance_routes as routes
    created = _create(client, data_dir).get_json()["data"]["service"]

    class RejectingRegistry:
        def capabilities(self, runtime_id):
            return {"deploy": True, "update": True, "start": True, "stop": True, "restart": True, "destroy": True}
        def validate(self, runtime_id, spec):
            return [{"code": "INVALID_SPEC", "message": "provider rejected spec", "details": {"password": "raw"}}]

    monkeypatch.setattr(routes, "_RUNTIME_REGISTRY", RejectingRegistry())
    response = client.post(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations/deploy",
        headers={**_headers(USER_A, data_dir), "Idempotency-Key": "provider-reject"},
    )
    # Lifecycle deploy validates the current normalized revision before queueing.
    assert response.status_code == 422
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_operations")["count"] == 0


def test_boolean_manifest_input_is_normalized_as_boolean(client, data_dir):
    enabled = _create(client, data_dir, spec={"mode": "safe", "enabled": True})
    assert enabled.status_code == 201
    revision = enabled.get_json()["data"]["service"]["revision"]
    assert revision["spec"]["enabled"] is True
    invalid = _create(client, data_dir, name="invalid-boolean", spec={"mode": "safe", "enabled": "true"})
    assert invalid.status_code == 422


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


def test_patch_queues_update_operation_and_is_idempotent(client, data_dir):
    created = _create(client, data_dir).get_json()["data"]["service"]
    headers = {**_headers(USER_A, data_dir), "Idempotency-Key": "patch-update-1"}
    response = client.patch(
        f"/api/projects/{PROJECT_A}/services/{created['id']}",
        json={"spec": {"mode": "fast", "memory_mb": 1024}},
        headers=headers,
    )
    assert response.status_code == 202
    operation = response.get_json()["operation"]
    assert operation["kind"] == "service.update"
    retry = client.patch(
        f"/api/projects/{PROJECT_A}/services/{created['id']}",
        json={"spec": {"mode": "fast", "memory_mb": 1024}},
        headers=headers,
    )
    assert retry.status_code == 202
    assert retry.get_json()["operation"]["id"] == operation["id"]
    changed = client.patch(
        f"/api/projects/{PROJECT_A}/services/{created['id']}",
        json={"spec": {"mode": "safe", "memory_mb": 1024}},
        headers=headers,
    )
    assert changed.status_code == 409
    assert changed.get_json()["error"]["code"] == "SERVICE_OPERATION_CONFLICT"
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_revisions WHERE instance_id = %s", (created["id"],))["count"] == 2


def test_rollback_rejection_is_atomic_and_success_targets_created_revision(client, data_dir):
    created = _create(client, data_dir).get_json()["data"]["service"]
    patch = client.patch(
        f"/api/projects/{PROJECT_A}/services/{created['id']}",
        json={"spec": {"mode": "fast", "memory_mb": 1024}},
        headers={**_headers(USER_A, data_dir), "Idempotency-Key": "rollback-prep"},
    )
    assert patch.status_code == 202
    pg.execute("DELETE FROM service_operations WHERE instance_id = %s", (created["id"],))
    revisions = client.get(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/revisions",
        headers=_headers(USER_A, data_dir),
    ).get_json()["data"]["revisions"]
    target = next(item for item in revisions if item["revision_number"] == 1)
    before = pg.query_one("SELECT COUNT(*) AS count FROM service_revisions WHERE instance_id = %s", (created["id"],))["count"]
    rejected = client.post(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations/rollback",
        json={"revision_id": "not-owned"},
        headers={**_headers(USER_A, data_dir), "Idempotency-Key": "rollback-rejected"},
    )
    assert rejected.status_code in {404, 422}
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_revisions WHERE instance_id = %s", (created["id"],))["count"] == before
    queued = client.post(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations/rollback",
        json={"revision_id": target["id"]},
        headers={**_headers(USER_A, data_dir), "Idempotency-Key": "rollback-good"},
    )
    assert queued.status_code == 202
    operation = queued.get_json()["operation"]
    payload = pg.query_one("SELECT payload FROM service_operations WHERE id = %s", (operation["id"],))["payload"]
    assert payload["desired_revision_id"] != target["id"]
    assert payload["rollback_target_revision_id"] == target["id"]


def test_failed_rollback_exposes_retry_revision_context(client, data_dir):
    created = _create(client, data_dir).get_json()["data"]["service"]
    patch = client.patch(
        f"/api/projects/{PROJECT_A}/services/{created['id']}",
        json={"spec": {"mode": "fast", "memory_mb": 1024}},
        headers={**_headers(USER_A, data_dir), "Idempotency-Key": "rollback-context-prep"},
    )
    assert patch.status_code == 202
    pg.execute("DELETE FROM service_operations WHERE instance_id = %s", (created["id"],))
    revisions = client.get(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/revisions",
        headers=_headers(USER_A, data_dir),
    ).get_json()["data"]["revisions"]
    target = next(item for item in revisions if item["revision_number"] == 1)
    queued = client.post(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations/rollback",
        json={"revision_id": target["id"]},
        headers={**_headers(USER_A, data_dir), "Idempotency-Key": "rollback-context"},
    )
    assert queued.status_code == 202
    operation_id = queued.get_json()["operation"]["id"]
    pg.execute("UPDATE service_operations SET status='failed', error_code='PROVIDER_ERROR', error_message='temporary' WHERE id=%s", (operation_id,))
    failed = client.get(
        f"/api/projects/{PROJECT_A}/services/{created['id']}/operations/{operation_id}",
        headers=_headers(USER_A, data_dir),
    )
    assert failed.status_code == 200
    operation_view = failed.get_json()["data"]["operation"]
    assert operation_view["retry_context"]["revision_id"] == target["id"]


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
        json={"confirm": True, "target_id": created["id"], "revision_id": created["desired_revision_id"]},
        headers={**base, "Idempotency-Key": "destroy-1"},
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
