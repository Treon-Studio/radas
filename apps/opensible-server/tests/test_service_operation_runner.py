"""Worker protocol tests for queued service operations."""
from __future__ import annotations

import threading
import time

import flask
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


def test_concurrent_terminal_event_writes_are_database_idempotent(pg_db):
    _project()
    instance = _instance()
    operation = _operation(instance)
    barrier = threading.Barrier(8)
    errors = []

    def write_event():
        try:
            barrier.wait()
            service_operation_runner.append_event(operation["id"], "failed", message="provider failed")
        except Exception as exc:  # pragma: no cover - assertion below reports it
            errors.append(exc)

    threads = [threading.Thread(target=write_event) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert not errors
    assert pg.query_one(
        "SELECT COUNT(*) AS count FROM service_operation_events WHERE operation_id=%s AND event='failed'",
        (operation["id"],),
    )["count"] == 1


def test_queued_and_terminal_events_are_emitted_once_across_retry_and_reclaim(pg_db):
    _project()
    instance = _instance()
    operation = _operation(instance)

    queued_events = pg.query_all(
        "SELECT event FROM service_operation_events WHERE operation_id=%s AND event='queued'",
        (operation["id"],),
    )
    assert len(queued_events) == 1

    claim = service_operation_runner.claim_next_operation("worker-a")
    assert claim["operation_id"] == operation["id"]
    before_running = pg.query_all(
        "SELECT event FROM service_operation_events WHERE operation_id=%s ORDER BY id",
        (operation["id"],),
    )
    assert [row["event"] for row in before_running] == ["queued", "running"]
    pg.execute("UPDATE service_operations SET lease_until=%s WHERE id=%s", (time.time() - 1, operation["id"]))
    assert service_operation_runner.reclaim_expired() == 1
    restarted = service_operation_runner.claim_next_operation("worker-b")
    assert restarted["operation_id"] == operation["id"]
    done = service_operation_runner.finish_operation(
        operation["id"], "worker-b", success=False, error_message="provider failed",
        lease_token=restarted["lease_token"],
    )
    assert done["status"] == "failed"

    # Repeated finish and queued/terminal event paths are idempotent.
    repeated = service_operation_runner.finish_operation(
        operation["id"], "worker-b", success=False, lease_token=restarted["lease_token"],
    )
    assert repeated["status"] == "failed"
    events = pg.query_all(
        "SELECT event FROM service_operation_events WHERE operation_id=%s ORDER BY id",
        (operation["id"],),
    )
    assert [row["event"] for row in events].count("queued") == 1
    assert [row["event"] for row in events].count("failed") == 1


def test_claim_payload_failure_terminalizes_and_clears_lease(pg_db, monkeypatch):
    _project()
    instance = _instance()
    operation = _operation(instance)
    monkeypatch.setattr(service_operation_runner, "_payload", lambda conn, row: None)
    assert service_operation_runner.claim_next_operation("worker-a") is None
    stored = pg.query_one("SELECT status,finished_at,worker_id,lease_token,lease_until,heartbeat_at FROM service_operations WHERE id=%s", (operation["id"],))
    assert stored["status"] == "failed"
    assert stored["finished_at"] is not None
    assert all(stored[key] is None for key in ("worker_id", "lease_token", "lease_until", "heartbeat_at"))
    assert service_operation_runner.list_events(operation["id"])[-1]["event"] == "failed"


def test_claim_preserves_secret_ref_metadata_without_secret_values(pg_db):
    _project()
    instance = service_instances.create_instance(
        "runner-project", "secret-ref-service", "static-web", "1.0.0", "development", "mock",
        {"name": "secret-ref-service", "secrets": {"admin_password": {"secret_ref": "secret://vault/admin"}}},
        created_by="owner", actor_id="owner",
    )
    operation = _operation(instance, key="secret-ref-key")
    claim = service_operation_runner.claim_next_operation("worker-a")
    assert claim["spec"]["secrets"]["admin_password"] == {"secret_ref": "secret://vault/admin"}
    assert "raw-secret" not in str(claim)
    assert claim["spec"]["secrets"]["admin_password"].get("value") is None


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


def test_finish_without_result_persists_operation_failed_code(pg_db):
    _project()
    instance = _instance()
    operation = _operation(instance)
    claim = service_operation_runner.claim_next_operation("worker-a")
    done = service_operation_runner.finish_operation(
        operation["id"], "worker-a", success=False, result=None,
        error_code=None, error_message="malformed provider result", lease_token=claim["lease_token"],
    )
    assert done["status"] == "failed"
    assert done["error_code"] == "OPERATION_FAILED"
    stored = pg.query_one("SELECT error_code FROM service_operations WHERE id=%s", (operation["id"],))
    assert stored["error_code"] == "OPERATION_FAILED"


def test_error_code_is_allowlisted_in_operation_and_events(pg_db):
    _project()
    instance = _instance()
    operation = _operation(instance)
    claim = service_operation_runner.claim_next_operation("worker-a")
    done = service_operation_runner.finish_operation(
        operation["id"], "worker-a", success=False, error_code="password=top-secret",
        error_message="password=top-secret", lease_token=claim["lease_token"],
    )
    assert done["error_code"] == "OPERATION_FAILED"
    assert "top-secret" not in str(service_operation_runner.list_events(operation["id"]))


def test_event_details_redact_sensitive_keys_recursively_before_persist_and_return(pg_db):
    _project()
    instance = _instance()
    operation = _operation(instance)
    raw_values = ["raw-api-key", "raw-access-token", "raw-password", "raw-secret", "raw-private-key"]
    details = {
        "api_key": raw_values[0],
        "nested": {
            "access_token": raw_values[1],
            "safe": "token: raw-inline-token",
            "items": [{"password": raw_values[2]}, {"metadata": {"private_key": raw_values[4]}}],
        },
        "credentials": {"secret": raw_values[3]},
        "message": "authorization=raw-authorization",
    }

    event = service_operation_runner.append_event(operation["id"], "provider_step", details=details)
    stored = pg.query_one(
        "SELECT details FROM service_operation_events WHERE operation_id=%s AND event='provider_step'",
        (operation["id"],),
    )
    for value in raw_values + ["raw-inline-token", "raw-authorization"]:
        assert value not in str(stored["details"])
        assert value not in str(event)
    assert stored["details"]["api_key"] == "[REDACTED]"
    assert stored["details"]["nested"]["items"][1]["metadata"]["private_key"] == "[REDACTED]"


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


def test_stale_lease_cannot_heartbeat_finish_or_log(pg_db):
    _project()
    instance = _instance()
    operation = _operation(instance)
    claim = service_operation_runner.claim_next_operation("worker-a")
    token = claim["lease_token"]
    pg.execute("UPDATE service_operations SET lease_until=%s WHERE id=%s", (time.time() - 1, operation["id"]))
    assert not service_operation_runner.heartbeat(operation["id"], "worker-a", lease_token=token)
    assert service_operation_runner.finish_operation(operation["id"], "worker-a", success=True, result={}, lease_token=token)["status"] == "running"
    assert service_operation_runner.append_worker_event(operation["id"], "worker-a", token, "worker_log", message="stale") is None


def test_finish_outcome_distinguishes_stale_noop(pg_db):
    _project()
    instance = _instance()
    operation = _operation(instance)
    claim = service_operation_runner.claim_next_operation("worker-a")
    pg.execute("UPDATE service_operations SET lease_until=%s WHERE id=%s", (time.time() - 1, operation["id"]))
    done, applied = service_operation_runner.finish_operation(
        operation["id"], "worker-a", success=True, result={}, lease_token=claim["lease_token"], _with_outcome=True,
    )
    assert done["id"] == operation["id"]
    assert applied is False
    current = pg.query_one("SELECT worker_id,lease_token,heartbeat_at FROM service_operations WHERE id=%s", (operation["id"],))
    assert current["worker_id"] == "worker-a"
    assert current["lease_token"] == claim["lease_token"]


def test_worker_finish_stale_response_is_sanitized_and_does_not_clear_heartbeat(pg_db, workers_env, monkeypatch):
    from api import register_blueprints
    from services.worker_registry import update_worker_heartbeat

    _project()
    instance = _instance()
    operation = _operation(instance)
    claim = service_operation_runner.claim_next_operation("worker-a")
    worker_id, worker_token = workers_env.create_worker("runner")
    update_worker_heartbeat(worker_id, current_execution_id=operation["id"])
    app = flask.Flask("worker-finish-test")
    app.config.update(TESTING=True)
    register_blueprints(app)
    pg.execute("UPDATE service_operations SET worker_id=%s WHERE id=%s", (worker_id, operation["id"]))
    original_finish = service_operation_runner.finish_operation
    newer_claim = {}

    def reclaim_before_finish(*args, **kwargs):
        pg.execute("UPDATE service_operations SET lease_until=%s WHERE id=%s", (time.time() - 1, operation["id"]))
        assert service_operation_runner.reclaim_expired() == 1
        newer_claim.update(service_operation_runner.claim_next_operation("worker-b") or {})
        assert newer_claim
        return original_finish(*args, **kwargs)

    monkeypatch.setattr(service_operation_runner, "finish_operation", reclaim_before_finish)
    response = app.test_client().post(
        f"/api/worker/executions/{operation['id']}/finish",
        json={"status": "SUCCESS", "leaseToken": claim["lease_token"], "result": {"secret": "must-not-leak"}},
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    assert response.status_code == 409
    body = response.get_json()
    assert body["operation"] == {"id": operation["id"]}
    assert "new-token" not in str(body)
    assert "must-not-leak" not in str(body)
    current = pg.query_one("SELECT lease_token FROM service_operations WHERE id=%s", (operation["id"],))
    assert current["lease_token"] == newer_claim["lease_token"]
    assert workers_env.load_worker(worker_id)["currentExecutionId"] == operation["id"]


def test_disconnect_reclaim_allows_restart_and_heartbeat_is_owned(pg_db, monkeypatch):
    _project()
    instance = _instance()
    operation = _operation(instance)
    claim = service_operation_runner.claim_next_operation("worker-a", lease_seconds=10)
    assert service_operation_runner.heartbeat(operation["id"], "worker-a", lease_token=claim["lease_token"])
    pg.execute("UPDATE service_operations SET lease_until=%s WHERE id=%s", (time.time() - 1, operation["id"]))
    assert service_operation_runner.reclaim_expired() == 1
    assert not service_operation_runner.heartbeat(operation["id"], "worker-a", lease_token=claim["lease_token"])
    restarted = service_operation_runner.claim_next_operation("worker-b")
    assert restarted["operation_id"] == operation["id"]
    assert restarted["idempotency_key"] == "runner-key"
