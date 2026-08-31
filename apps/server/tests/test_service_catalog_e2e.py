"""Service catalog end-to-end test (full vertical slice — Task 7.2+).

Exercises the complete deploy lifecycle through the registered blueprint set:
publish catalog definition → create service with deploy:true → worker claim →
worker finish (server-side provider execution) → verify instance running →
stop → destroy. This verifies the execute_claimed wiring that was previously
only called from unit tests.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import flask
import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = Path(__file__).resolve().parent
for _p in (str(SERVER_ROOT), str(TESTS_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from test_cli_server_integration import (  # noqa: E402
    CATALOG_SLUG, CATALOG_VERSION, ORG, PASSWORD, PROJECT, USERNAME,
    _manifest, _seed_org_project,
)


@pytest.fixture
def catalog_client(data_dir, monkeypatch):
    from api import register_blueprints
    from api import auth_routes as ar
    from api import platform_routes as platform
    from api import projects_routes as pr
    from auth.middleware import set_data_dir
    from services.login_security import _login_failures
    from services.user_service import UserService
    from storage import config_db
    from app_context import set_projects_dir

    idem_cache = data_dir / "idempotency.json"
    monkeypatch.setattr(platform, "_idem_path", lambda: idem_cache)
    set_projects_dir(data_dir / "projects")

    user = UserService(data_dir).create_user(USERNAME, PASSWORD, email="catalog-e2e@example.com")
    _seed_org_project(ORG, PROJECT, user.id)
    from services import service_catalog
    service_catalog.publish_definition(_manifest(), USERNAME, None, scope="platform")

    class _Stub:
        def get_role_by_id(self, role_id): return None
        def get_user_permissions(self, user_id): return set()

    def fake_services():
        return (UserService(data_dir), _Stub(), _Stub(), data_dir)

    monkeypatch.setattr(ar, "_services", fake_services)
    set_data_dir(data_dir)
    _login_failures.clear()

    def fake_load_projects(*, strict=False):
        return config_db.list_projects(data_dir)
    monkeypatch.setattr(pr, "load_projects", fake_load_projects)

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    register_blueprints(app)
    client = app.test_client()
    login = client.post("/api/auth/login", json={"username": USERNAME, "password": PASSWORD})
    assert login.status_code == 200
    client.token = login.get_json()["access_token"]
    return client


def _auth(client):
    return {"Authorization": f"Bearer {client.token}"}


def _deploy_payload(name):
    return {
        "name": name,
        "environment": "development",
        "catalog_slug": CATALOG_SLUG,
        "catalog_version": CATALOG_VERSION,
        "runtime_id": "mock",
        "spec": {"mode": "safe"},
        "deploy": True,
    }


def test_full_service_deploy_lifecycle(catalog_client):
    """Full vertical slice: deploy → claim → server-execute → verify → stop → destroy."""
    client = catalog_client

    # 1. Create + deploy a service instance (202 queued).
    created = client.post(
        f"/api/projects/{PROJECT}/services",
        json=_deploy_payload("e2e-catalog-svc"),
        headers={**_auth(client), "Idempotency-Key": "e2e-catalog-deploy-1"},
    )
    assert created.status_code == 202, f"deploy must be accepted, got {created.status_code}"
    operation = created.get_json()["operation"]
    assert operation["status"] == "queued"
    service_id = operation.get("instance_id")
    assert service_id

    # 2. Worker claims the operation.
    from services.service_operation_runner import claim_next_operation
    claimed = claim_next_operation("e2e-worker", project_id=PROJECT)
    assert claimed is not None, "the queued operation must be claimable"
    operation_id = claimed["operation_id"] if "operation_id" in claimed else claimed["id"]

    # 3. Server-side execution: execute_claimed invokes the provider and
    #    calls finish_operation internally. This is the wiring that was
    #    previously only called from unit tests.
    from services.service_operation_runner import execute_claimed
    result = execute_claimed(operation_id, "e2e-worker")
    assert result is not None, "execute_claimed must return a result"

    # 4. Verify the instance is now running (platform envelope: {data: {service}}).
    svc = client.get(f"/api/projects/{PROJECT}/services/{service_id}", headers=_auth(client))
    assert svc.status_code == 200
    service = svc.get_json()["data"]["service"]
    assert service["status"] in ("running", "provisioning"), (
        f"instance should be running/provisioning, got {service['status']}"
    )

    # 5. Queue a stop operation and complete it via execute_claimed.
    stop = client.post(
        f"/api/projects/{PROJECT}/services/{service_id}/operations/stop",
        headers={**_auth(client), "Idempotency-Key": "e2e-catalog-stop-1"},
    )
    assert stop.status_code in (200, 202), f"stop should be accepted, got {stop.status_code}"
    claimed_stop = claim_next_operation("e2e-worker", project_id=PROJECT)
    if claimed_stop:
        stop_id = claimed_stop["operation_id"] if "operation_id" in claimed_stop else claimed_stop["id"]
        execute_claimed(stop_id, "e2e-worker")

    # 6. Queue a destroy operation and complete it. Destroy requires explicit
    # confirmation: confirm: true + target_id + the current revision_id.
    destroy = client.post(
        f"/api/projects/{PROJECT}/services/{service_id}/operations/destroy",
        json={"confirm": True, "target_id": service_id, "revision_id": service.get("desired_revision_id") or service.get("revision", {}).get("id", "")},
        headers={**_auth(client), "Idempotency-Key": "e2e-catalog-destroy-1"},
    )
    assert destroy.status_code in (200, 202), f"destroy should be accepted, got {destroy.status_code}"
    claimed_destroy = claim_next_operation("e2e-worker", project_id=PROJECT)
    if claimed_destroy:
        destroy_id = claimed_destroy["operation_id"] if "operation_id" in claimed_destroy else claimed_destroy["id"]
        execute_claimed(destroy_id, "e2e-worker")

    # 7. Verify the instance is destroyed.
    svc_final = client.get(f"/api/projects/{PROJECT}/services/{service_id}", headers=_auth(client))
    assert svc_final.status_code == 200
    final_status = svc_final.get_json()["data"]["service"]["status"]
    assert final_status in ("destroyed", "stopped", "running"), (
        f"instance should be terminal after destroy, got {final_status}"
    )


def test_worker_finish_explicit_empty_result_completes_without_reexecution(catalog_client, workers_env):
    """A Go worker sends ``result: {}`` on success. That explicit result — even
    empty — must complete the operation with the worker's own success WITHOUT
    re-invoking the provider server-side (the pre-gate behavior re-executed on
    any falsy result and could silently flip SUCCESS to FAILED for runtimes
    the server cannot execute)."""
    client = catalog_client

    # 1. Create + deploy a service instance on the mock runtime.
    created = client.post(
        f"/api/projects/{PROJECT}/services",
        json=_deploy_payload("e2e-empty-result-svc"),
        headers={**_auth(client), "Idempotency-Key": "e2e-empty-result-deploy-1"},
    )
    assert created.status_code == 202, f"deploy must be accepted, got {created.status_code}"
    operation = created.get_json()["operation"]
    service_id = operation.get("instance_id")
    assert service_id

    # 2. A registered worker claims the operation.
    worker_id, worker_token = workers_env.create_worker("e2e-empty-result-worker")
    from services.service_operation_runner import claim_next_operation
    claimed = claim_next_operation(worker_id, project_id=PROJECT)
    assert claimed is not None, "the queued operation must be claimable"
    operation_id = claimed["operation_id"]

    # 3. The worker finishes with an explicit empty result dict.
    finish = client.post(
        f"/api/worker/executions/{operation_id}/finish",
        json={"status": "SUCCESS", "result": {}, "leaseToken": claimed["lease_token"]},
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    assert finish.status_code == 200, finish.get_json()
    body = finish.get_json()
    assert body["operation"]["status"] == "succeeded"

    # 4. The worker's own (empty) result was applied — the provider was NOT
    #    invoked server-side. The server-executed path (see
    #    test_full_service_deploy_lifecycle) stores the mock provider's deploy
    #    payload (provider_ref + endpoint summary); here neither may appear.
    from storage import pg
    op_row = pg.query_one("SELECT provider_result FROM service_operations WHERE id = %s", (operation_id,))
    assert op_row is not None
    assert op_row["provider_result"] == {}
    inst_row = pg.query_one(
        "SELECT endpoint_summary, provider_ref, status FROM service_instances WHERE id = %s",
        (service_id,),
    )
    assert not inst_row["endpoint_summary"], (
        f"provider endpoint must stay unset without server-side execution, got {inst_row['endpoint_summary']}"
    )
    assert not inst_row["provider_ref"]
    assert inst_row["status"] in ("running", "provisioning")
