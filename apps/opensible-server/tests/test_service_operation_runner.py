"""Worker protocol tests for queued service operations."""
from __future__ import annotations

import time

import pytest

from services import runtime_registry, service_instances, service_operation_runner, service_operations
from storage import pg


def _project() -> None:
    now = time.time()
    pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)", ("runner-org", "runner-org", "owner", now))
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,0,%s,%s)",
        ("runner-project", "runner-org", "owner", "runner-project", "", now, now),
    )
    pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)", ("runner-org", "owner", "owner", now))


def _instance():
    return service_instances.create_instance(
        "runner-project", "runner-service", "static-web", "1.0.0", "development", "mock",
        {"name": "runner-service", "image": "example/service:1", "password": "never-persist"},
        created_by="owner", actor_id="owner",
    )


def _operation(instance, key="runner-key"):
    return service_operations.create_operation(
        "runner-project", "service.deploy", key,
        {"operation": "deploy", "desired_revision_id": instance["desired_revision_id"], "password": "never-persist"},
        instance_id=instance["id"], requested_by="owner", actor_id="owner", initial_status="queued",
    )


def test_claim_is_exclusive_and_payload_is_redacted(pg_db):
    _project()
    instance = _instance()
    operation = _operation(instance)
    first = service_operation_runner.claim_next_operation("worker-a")
    second = service_operation_runner.claim_next_operation("worker-b")
    assert first["operation_id"] == operation["id"]
    assert second is None
    assert "never-persist" not in str(first)
    stored = pg.query_one("SELECT payload FROM service_operations WHERE id=%s", (operation["id"],))
    assert "never-persist" not in str(stored)
    assert stored["payload"]["desired_revision_id"] == instance["desired_revision_id"]


def test_mock_provider_success_updates_instance_and_is_idempotent(pg_db):
    _project()
    instance = _instance()
    operation = _operation(instance)
    claim = service_operation_runner.claim_next_operation("worker-a")
    assert claim["runtime_id"] == "mock"
    done = service_operation_runner.execute_claimed(operation["id"], "worker-a")
    assert done["status"] == "succeeded"
    assert service_instances.get_instance("runner-project", instance["id"], actor_id="owner")["status"] == "running"
    repeated = service_operation_runner.finish_operation(operation["id"], "worker-a", success=True, result={})
    assert repeated["status"] == "succeeded"
    assert len(service_operation_runner.list_events(operation["id"])) >= 3


def test_provider_failure_preserves_desired_revision(pg_db):
    _project()
    instance = _instance()
    operation = _operation(instance)
    service_operation_runner.claim_next_operation("worker-a")
    provider = runtime_registry.build_default_registry()
    mock = provider.require("mock")
    mock.configure_failure({"code": "PROVIDER_ERROR", "message": "password=never-persist"})
    done = service_operation_runner.execute_claimed(operation["id"], "worker-a", registry=provider)
    assert done["status"] == "failed"
    current = service_instances.get_instance("runner-project", instance["id"], actor_id="owner")
    assert current["desired_revision_id"] == instance["desired_revision_id"]
    assert "never-persist" not in str(done)


def test_cancellation_is_terminal_and_rejects_late_finish(pg_db):
    _project()
    instance = _instance()
    operation = _operation(instance)
    service_operation_runner.claim_next_operation("worker-a")
    canceled = service_operation_runner.cancel_operation("runner-project", operation["id"], actor_id="owner")
    assert canceled["status"] == "canceled"
    late = service_operation_runner.finish_operation(operation["id"], "worker-a", success=True, result={})
    assert late["status"] == "canceled"


def test_disconnect_reclaim_allows_restart_and_heartbeat_is_owned(pg_db, monkeypatch):
    _project()
    instance = _instance()
    operation = _operation(instance)
    service_operation_runner.claim_next_operation("worker-a", lease_seconds=10)
    assert service_operation_runner.heartbeat(operation["id"], "worker-a")
    pg.execute("UPDATE service_operations SET lease_until=%s WHERE id=%s", (time.time() - 1, operation["id"]))
    assert service_operation_runner.reclaim_expired() == 1
    assert not service_operation_runner.heartbeat(operation["id"], "worker-a")
    restarted = service_operation_runner.claim_next_operation("worker-b")
    assert restarted["operation_id"] == operation["id"]
    assert restarted["idempotency_key"] == "runner-key"
