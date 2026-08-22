"""Integration tests for service operation execution (worker claim → mock provider → status update)."""

import time
from pathlib import Path
from unittest.mock import patch

import pytest
import flask

from auth.service import generate_token
from services import service_catalog, service_operation_runner, service_instances, service_operations
from storage import pg

ORG_A = "org-service-exec"
PROJECT_A = "project-service-exec"
USER_A = "service-exec-user"


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
        "slug": "exec-demo",
        "name": "Execution Demo Service",
        "version": "1.0.0",
        "category": "web",
        "summary": "A harmless service used by execution tests",
        "runtime": "container",
        "image": "example/exec-demo:1.0",
        "production_ready": False,
        "persistence": "stateless",
        "inputs": [
            {"name": "mode", "type": "enum", "choices": ["safe", "fast"], "default": "safe"},
        ],
        "secrets": [],
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


def _headers(user_id: str, data_dir: Path) -> dict[str, str]:
    token = generate_token(user_id, user_id, [], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def data_and_client(data_dir: Path, monkeypatch):
    # Seed project and catalog
    _seed_project(PROJECT_A, ORG_A, USER_A)
    service_catalog.publish_definition(_manifest(), USER_A, None, scope="platform")

    # Create a minimal Flask app to provide request context for the route
    app = flask.Flask("service-exec-test")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)

    # Register the service instance blueprint so we can create instances via the API
    from api import register_blueprints
    register_blueprints(app)

    client = app.test_client()
    return client, data_dir


def test_full_execution_flow_with_mock_provider(data_and_client):
    """Test that a service instance created with deploy=True results in a queued operation,
    which a worker can claim and execute via the mock provider, and the instance status becomes running."""
    client, data_dir = data_and_client

    # 1. Create a service instance with deploy=True
    payload = {
        "name": "exec-test",
        "environment": "development",
        "catalog_slug": "exec-demo",
        "catalog_version": "1.0.0",
        "runtime_id": "mock",
        "spec": {"mode": "safe"},
        "deploy": True,
    }
    headers = {**_headers(USER_A, data_dir), "Idempotency-Key": "exec-deploy-1"}
    response = client.post(f"/api/projects/{PROJECT_A}/services", json=payload, headers=headers)
    assert response.status_code == 202
    operation_body = response.get_json()
    operation = operation_body["operation"]
    assert operation["kind"] == "service.deploy"
    assert operation["status"] == "queued"
    instance_id = operation["instance_id"]

    # 2. Simulate a worker claiming the operation
    # We need a worker ID. The worker registry requires a worker to be registered.
    # We can create a worker token via the worker registry or mock the worker registry functions.
    # For simplicity, we'll mock the worker registry to avoid external dependencies.

    # Actually, claim_next_operation expects a worker_id and does not require the worker to exist in the registry.
    # It uses the worker_id only for logging and concurrency limits. So we can just pass a dummy worker_id.
    # However, it does call get_worker_active_runs_count from worker_registry, which may require a worker.
    # We can patch that to return 0.
    with patch("services.worker_registry.get_worker_active_runs_count", return_value=0):
        # Claim the operation
        claimed = service_operation_runner.claim_next_operation(worker_id="test-worker", project_id=PROJECT_A)
        assert claimed is not None
        assert claimed["operation_id"] == operation["id"]
        assert claimed["lease_token"] is not None

        # 3. Execute the claimed operation using the mock provider
        # execute_claimed will call the provider and then finish the operation.
        # We need to ensure the runtime registry has the mock provider.
        from services.runtime_registry import build_default_registry
        registry = build_default_registry()
        # Patch the registry used by service_operation_runner.execute_claimed?
        # Actually execute_claimed uses the default registry internally.
        # We'll patch the build_default_registry to return our registry (or ensure it's already there).

        # We'll just call execute_claimed directly, which will use the default registry (which includes mock).
        result = service_operation_runner.execute_claimed(operation["id"], "test-worker")
        # execute_claimed returns the updated operation record.
        assert result is not None
        assert result["status"] == "succeeded"  # The mock provider returns success.

        # 4. Verify the instance status became running and endpoint_summary is populated.
        instance = service_instances.require_instance(PROJECT_A, instance_id, actor_id=USER_A)
        assert instance["status"] == "running"
        # The mock provider sets endpoint_summary to a URL string
        assert instance["endpoint_summary"] is not None
        assert isinstance(instance["endpoint_summary"], str)
        assert "mock.radas.local" in instance["endpoint_summary"]

        # Also verify the operation is finished
        op = service_operations.get_operation(PROJECT_A, operation["id"], actor_id=USER_A)
        assert op["status"] == "succeeded"
        assert op["finished_at"] is not None
        # The provider result is stored as provider_result (JSONB)
        provider_result = op.get("provider_result")
        assert provider_result is not None, "provider_result missing from operation"
        assert provider_result.get("success") is True
        assert provider_result.get("data", {}).get("endpoint") == "https://mock.radas.local/services/exec-test"