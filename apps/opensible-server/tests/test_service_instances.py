"""Task 1.3 service-instance/revision/operation contract tests."""
from __future__ import annotations

import copy
import threading
import time

import pytest

from services import service_instances, service_operations
from storage import pg


def _project(project_id: str = "project-a", org_id: str = "org-a") -> None:
    pg.execute(
        "INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)",
        (org_id, org_id, "owner", time.time()),
    )
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s,%s)",
        (project_id, org_id, "owner", project_id, "", time.time(), time.time()),
    )
    pg.execute(
        "INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",
        (org_id, "owner", "owner", time.time()),
    )


def _instance(project_id: str = "project-a", **kwargs):
    values = {
        "name": "demo",
        "definition_slug": "static-web",
        "definition_version": "1.0.0",
        "environment": "development",
        "runtime_id": "mock",
        "spec": {"image": "example/demo:1", "secret_ref": "secret://db-password"},
        "created_by": "owner",
    }
    values.update(kwargs)
    values.setdefault("actor_id", "owner")
    return service_instances.create_instance(project_id, **values)


def test_migration_creates_tables_constraints_and_indexes(pg_db):
    for table in ("service_instances", "service_revisions", "service_operations"):
        assert pg.query_one("SELECT to_regclass(%s) AS table_name", (table,))["table_name"] == table
    indexes = pg.query_all(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE %s",
        ("idx_service_%",),
    )
    names = {row["indexname"] for row in indexes}
    assert {
        "idx_service_instances_project_environment_status",
        "idx_service_revisions_instance_created",
        "idx_service_operations_polling",
        "idx_service_operations_instance_created",
    } <= names
    assert pg.query_one(
        "SELECT conname FROM pg_constraint WHERE conname = %s",
        ("uq_service_instances_project_environment_name",),
    )


def test_missing_actor_is_denied_and_explicit_internal_context_is_allowed(pg_db):
    _project()
    with pytest.raises(service_instances.ProjectAuthorizationError):
        _instance(actor_id=None)
    context = service_instances.internal_execution_context()
    created = _instance(internal_context=context)
    assert created["project_id"] == "project-a"
    assert created["created_at"] <= created["updated_at"]
    assert service_instances.list_instances("project-a", internal_context=context)[0]["id"] == created["id"]


def test_internal_context_is_rejected_after_secret_changes(pg_db, monkeypatch):
    _project()
    context = service_instances.internal_execution_context()
    monkeypatch.setenv("INTERNAL_CALL_SECRET", "a-different-stable-secret")
    with pytest.raises(service_instances.ProjectAuthorizationError):
        service_instances.list_instances("project-a", internal_context=context)


def test_internal_context_cannot_cross_project_or_bypass_project_mismatch(pg_db):
    _project()
    _project("project-b", "org-b")
    context = service_instances.internal_execution_context()
    created = _instance(internal_context=context)
    assert service_instances.get_instance("project-b", created["id"], internal_context=context) is None
    assert service_instances.list_instances("project-b", internal_context=context) == []


def test_project_isolation_and_project_derived_org_authorization(pg_db):
    _project()
    _project("project-b", "org-b")
    created = _instance()
    assert service_instances.get_instance("project-b", created["id"], actor_id="owner") is None
    assert service_instances.list_instances("project-b", actor_id="owner") == []
    with pytest.raises(service_instances.ProjectAuthorizationError):
        _instance(org_id="org-b", actor_id="owner")
    with pytest.raises(service_instances.ProjectAuthorizationError):
        service_instances.authorize_project_access("project-a", org_id="org-b")
    with pytest.raises(service_instances.ProjectAuthorizationError):
        service_instances.get_instance("project-a", created["id"], actor_id="outsider")


def test_unique_name_is_project_environment_scoped(pg_db):
    _project()
    _project("project-b", "org-b")
    _instance()
    with pytest.raises(service_instances.InstanceConflictError):
        _instance()
    other_environment = _instance(environment="staging")
    other_project = _instance("project-b")
    assert other_environment["id"] != other_project["id"]


def test_revision_is_immutable_snapshot_and_desired_is_separate(pg_db):
    _project()
    spec = {"image": "example/demo:1", "resources": {"memory_mb": 512}}
    instance = _instance(spec=spec)
    original = service_instances.get_revision("project-a", instance["id"], revision_number=1, actor_id="owner")
    assert original["revision_number"] == 1
    spec["resources"]["memory_mb"] = 2048
    revision = service_instances.create_revision(instance["id"], spec, "owner", project_id="project-a", actor_id="owner")
    assert revision["revision_number"] == 2
    assert service_instances.get_revision("project-a", instance["id"], revision_number=1, actor_id="owner")["spec"]["resources"]["memory_mb"] == 512
    current = service_instances.get_instance("project-a", instance["id"], actor_id="owner")
    assert current["desired_revision_id"] == revision["id"]
    assert service_instances.get_revision("project-a", instance["id"], revision_id=original["id"], actor_id="owner")["id"] == original["id"]
    with pytest.raises(Exception):
        pg.execute("DELETE FROM service_revisions WHERE id = %s", (original["id"],))


def test_valid_and_invalid_instance_state_transitions_and_cas(pg_db):
    _project()
    instance = _instance()
    running = service_instances.update_observed_status(
        instance["id"], "provisioning", project_id="project-a", expected_status="draft", actor_id="owner",
        provider_ref={"provider_id": "runtime-1", "token": "do-not-store"},
    )
    assert running["status"] == "provisioning"
    running = service_instances.update_observed_status(
        instance["id"], "running", project_id="project-a", expected_status="provisioning",
        endpoint_summary={"url": "https://example.test"}, actor_id="owner",
    )
    assert running["status"] == "running"
    with pytest.raises(service_instances.InvalidInstanceState):
        service_instances.update_observed_status(instance["id"], "destroyed", project_id="project-a", actor_id="owner")
    with pytest.raises(service_instances.InstanceConflictError):
        service_instances.update_observed_status(
            instance["id"], "degraded", project_id="project-a", expected_status="provisioning", actor_id="owner"
        )
    stored = pg.query_one("SELECT provider_ref FROM service_instances WHERE id = %s", (instance["id"],))["provider_ref"]
    assert "do-not-store" not in str(stored)


def test_idempotent_operation_retry_and_conflicting_payload(pg_db):
    _project()
    instance = _instance()
    first = service_operations.create_operation(
        "project-a", "service.deploy", "deploy-1", {"revision_id": "r1", "token": "secret-a"},
        instance_id=instance["id"], requested_by="owner", actor_id="owner",
    )
    retry = service_operations.create_operation(
        "project-a", "service.deploy", "deploy-1", {"revision_id": "r1", "token": "secret-a"},
        instance_id=instance["id"], requested_by="owner", actor_id="owner",
    )
    with pytest.raises(service_operations.OperationConflictError):
        service_operations.create_operation(
            "project-a", "service.deploy", "deploy-1", {"revision_id": "r1", "token": "secret-b"},
            instance_id=instance["id"], requested_by="owner", actor_id="owner",
        )
    assert retry is not None
    assert retry["id"] == first["id"]
    assert first["payload_fingerprint"] != service_operations.payload_fingerprint(
        "service.deploy", {"revision_id": "r1", "token": "secret-b"}, instance_id=instance["id"]
    )
    assert "secret-a" not in str(pg.query_one(
        "SELECT payload_fingerprint FROM service_operations WHERE id = %s", (first["id"],)
    ))
    with pytest.raises(service_operations.OperationConflictError):
        service_operations.create_operation(
            "project-a", "service.deploy", "deploy-1", {"revision_id": "r2"},
            instance_id=instance["id"], requested_by="owner", actor_id="owner",
        )
    other = _instance(name="other")
    with pytest.raises(service_operations.OperationConflictError, match="different operation identity"):
        service_operations.create_operation(
            "project-a", "service.deploy", "deploy-1", {"revision_id": "r1", "token": "secret-a"},
            instance_id=other["id"], requested_by="owner", actor_id="owner",
        )
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_operations")["count"] == 1


def test_operation_creation_rejects_terminal_status_and_terminal_retry_is_immutable(pg_db):
    _project()
    with pytest.raises(service_operations.InvalidOperationState):
        service_operations.create_operation("project-a", "service.deploy", "terminal", {}, actor_id="owner", initial_status="succeeded")
    operation = service_operations.create_operation("project-a", "service.deploy", "terminal-2", {}, actor_id="owner")
    service_operations.transition_operation("project-a", operation["id"], "running", actor_id="owner")
    done = service_operations.transition_operation("project-a", operation["id"], "succeeded", actor_id="owner")
    retry = service_operations.transition_operation("project-a", operation["id"], "succeeded", actor_id="owner")
    assert retry["finished_at"] == done["finished_at"]
    with pytest.raises(service_operations.OperationConflictError):
        service_operations.transition_operation("project-a", operation["id"], "failed", actor_id="owner", error_message="changed")


def test_operation_status_cas_and_terminal_transitions(pg_db):
    _project()
    operation = service_operations.create_operation("project-a", "service.deploy", "op-1", {}, actor_id="owner")
    queued = service_operations.transition_operation("project-a", operation["id"], "queued", expected_status="pending", actor_id="owner")
    assert queued["status"] == "queued"
    running = service_operations.transition_operation("project-a", operation["id"], "running", expected_status="queued", actor_id="owner")
    assert running["started_at"] is not None
    with pytest.raises(service_operations.OperationConflictError):
        service_operations.transition_operation("project-a", operation["id"], "failed", expected_status="queued", actor_id="owner")
    done = service_operations.transition_operation(
        "project-a", operation["id"], "succeeded", expected_status="running", actor_id="owner"
    )
    assert done["finished_at"] is not None
    with pytest.raises(service_operations.OperationConflictError):
        service_operations.transition_operation("project-a", operation["id"], "running", actor_id="owner")


def test_concurrent_operation_creators_share_one_idempotent_row(pg_db):
    _project()
    results: list[dict] = []
    errors: list[BaseException] = []
    barrier = threading.Barrier(2)

    def create() -> None:
        try:
            barrier.wait(timeout=5)
            results.append(service_operations.create_operation("project-a", "service.deploy", "same-key", {"revision_id": "r1"}, actor_id="owner"))
        except BaseException as exc:  # pragma: no cover - diagnostic path
            errors.append(exc)

    threads = [threading.Thread(target=create) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)
    assert not errors
    assert len({row["id"] for row in results}) == 1
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_operations")["count"] == 1


def test_fingerprint_requires_stable_configured_secret_and_changes_across_restart_secret(pg_db, monkeypatch):
    monkeypatch.delenv("IDEMPOTENCY_FINGERPRINT_SECRET", raising=False)
    monkeypatch.delenv("INTERNAL_CALL_SECRET", raising=False)
    with pytest.raises(service_operations.ServiceOperationError, match="configure"):
        service_operations.payload_fingerprint("service.deploy", {})
    monkeypatch.setenv("IDEMPOTENCY_FINGERPRINT_SECRET", "stable-secret-a")
    first = service_operations.payload_fingerprint("service.deploy", {}, instance_id="instance-a")
    monkeypatch.setenv("IDEMPOTENCY_FINGERPRINT_SECRET", "stable-secret-b")
    restarted = service_operations.payload_fingerprint("service.deploy", {}, instance_id="instance-a")
    assert first != restarted


def test_operation_reads_and_lists_allow_explicit_internal_context(pg_db):
    _project()
    context = service_instances.internal_execution_context()
    operation = service_operations.create_operation(
        "project-a", "service.deploy", "internal-list", {}, internal_context=context,
    )
    assert service_operations.get_operation("project-a", operation["id"], internal_context=context)["id"] == operation["id"]
    assert service_operations.list_operations("project-a", internal_context=context)[0]["id"] == operation["id"]


def test_specs_and_provider_outputs_never_persist_secret_values(pg_db):
    _project()
    raw = {"image": "example/demo:1", "password": "raw-password", "nested": {"api_key": "raw-key"}}
    instance = _instance(spec=raw)
    revision = service_instances.get_revision("project-a", instance["id"], revision_number=1, actor_id="owner")
    assert "raw-password" not in str(revision)
    assert "raw-key" not in str(revision)
    service_instances.update_observed_status(
        instance["id"], "provisioning", project_id="project-a", actor_id="owner",
        provider_ref={"credential": "provider-secret", "ref": "runtime://instance"},
    )
    stored = pg.query_one("SELECT provider_ref FROM service_instances WHERE id = %s", (instance["id"],))["provider_ref"]
    assert "provider-secret" not in str(stored)
    assert "runtime://instance" in str(stored)
