"""Failure/recovery drills (Task 6.3 of the 2026-08-27 console/CLI plan).

Each drill simulates one production failure mode against the REAL recovery /
retry / delivery code paths (no mocks of the system under test) and asserts
both the state cleanup AND the observable metric counter:

 1. Worker crash after claim  -> admission lease + project lock released,
    execution terminalized, log audit written, capacity freed for the next
    claim (server_recover_stuck_executions + lock_lifecycle).
 2. Provider timeout          -> bounded retry/backoff (retry_engine) and a
    terminal PROVIDER_TIMEOUT audit via the runtime registry (UC583).
 3. Webhook delivery failure  -> bounded retries then dead-letter queue with
    a visible failed-delivery record (UC404) + delivery-failure counter.
 4. DB reconnect + duplicate idempotency request -> the cached response
    survives a connection-pool reset and replays identically (UC458).
 5. Metrics surface           -> queue age, admission leases, lock-contention
    denials, recovery, provider-error and delivery-failure counters are all
    rendered by services/metrics.render_prometheus().

Failure labels follow the drill= naming used by the cross-client tests.
Tokens and credentials are never printed in assertion messages.
"""
from __future__ import annotations

import json
import time
import uuid

import pytest

from storage import pg, project_admission
from services import quota_service
from services.execution_history import create_execution_record
from storage import index_db


# ---------------------------------------------------------------------------
# Helpers (mirroring tests/test_project_admission_legacy.py)
# ---------------------------------------------------------------------------

def _setup_project(project_id: str, limit: int = 1) -> None:
    now = time.time()
    org_id = f"drill-org-{project_id}"
    pg.execute(
        "INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s, %s, %s, %s)",
        (org_id, org_id, "owner", now),
    )
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, created_at, updated_at) "
        "VALUES (%s, %s, %s, %s, %s, 0, %s, %s)",
        (project_id, org_id, "owner", project_id, "", now, now),
    )
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s)",
        (org_id, "owner", "owner", now),
    )
    quota_service.save_quota(project_id, 0, 0, 0.0, max_concurrent_runs=limit)


def _make_execution_file(project_id: str, exec_id: str, tmp_path, status: str = "QUEUED"):
    projects_dir = tmp_path / "projects"
    exec_dir = projects_dir / project_id / "history" / "executions"
    exec_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "id": exec_id,
        "projectId": project_id,
        "status": status,
        "queuedAt": time.time(),
        "createdAt": time.time(),
        "runParams": {"execution_type": "TOFU_RUN", "stack_name": "drill-stack", "tofu_action": "plan"},
    }
    path = exec_dir / f"{exec_id}.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    create_execution_record(data, project_id=project_id, execution_id=exec_id)
    if status == "QUEUED":
        index_db.add_queued_execution(exec_id, project_id, data["queuedAt"])
    return path


def _claim(worker_id: str, project_id: str, max_concurrency: int = 10):
    from app import server_claim_next_execution
    worker_data = {"name": worker_id, "tags": [], "capabilities": {}}
    return server_claim_next_execution(
        worker_id,
        worker_data,
        project_id=project_id,
        max_concurrency=max_concurrency,
        tags=[],
        recovering=False,
    )


def _admission_lease_count(reference_id: str) -> int:
    row = pg.query_one(
        "SELECT COUNT(*) AS count FROM project_admission_leases WHERE reference_id = %s",
        (reference_id,),
    )
    return int(row["count"]) if row else 0


# ---------------------------------------------------------------------------
# Drill 1: worker crash after claim -> full state cleanup
# ---------------------------------------------------------------------------

def test_drill_worker_crash_after_claim_releases_all_state(data_dir, monkeypatch):
    """A claimed execution whose worker dies is terminalized and frees every
    reservation: admission lease, project lock, and project capacity."""
    from services import lock_lifecycle

    monkeypatch.setattr("app.PROJECTS_DIR", data_dir / "projects")
    project_id = f"drill-crash-{uuid.uuid4().hex[:6]}"
    _setup_project(project_id, limit=1)

    exec_a = f"drill-a-{uuid.uuid4().hex[:8]}"
    exec_b = f"drill-b-{uuid.uuid4().hex[:8]}"
    path_a = _make_execution_file(project_id, exec_a, data_dir)
    _make_execution_file(project_id, exec_b, data_dir)

    claimed = _claim("drill-worker-1", project_id)
    assert claimed, "drill=crash: the first claim must be admitted"
    execution = json.loads(path_a.read_text(encoding="utf-8"))
    assert execution["status"] == "RUNNING"
    assert _admission_lease_count(exec_a) == 1

    # Mutating runs carry locks in runParams["lock_ids"] (mirrors the
    # cloud_provisioning wiring). The worker crashed before releasing them.
    acquisition = lock_lifecycle.acquire_for_execution(
        project_id, "drill-stack", "plan", actor="drill-worker-1", run_id=exec_a,
    )
    assert acquisition["project"].get("ok"), "drill=crash: project lock must be acquirable"
    execution["runParams"]["lock_ids"] = lock_lifecycle.lock_ids_from_acquisition(acquisition)

    # Simulate the crash: time passes, the worker never finishes.
    execution["startedAt"] = time.time() - 2 * 3600
    path_a.write_text(json.dumps(execution), encoding="utf-8")

    from app import server_recover_stuck_executions
    recovered = server_recover_stuck_executions(max_age_minutes=60)
    assert recovered >= 1, "drill=crash: the stuck execution must be recovered"

    # JSON terminal state + audit trail.
    execution = json.loads(path_a.read_text(encoding="utf-8"))
    assert execution["status"] == "FAILED", "drill=crash: stuck RUNNING must terminalize"
    assert "timeout" in str(execution.get("error", "")).lower()
    log_row = pg.query_one("SELECT data FROM execution_logs WHERE execution_id = %s", (exec_a,))
    assert log_row and b"[recovery]" in bytes(log_row["data"]), (
        "drill=crash: recovery must append an audit log line"
    )

    # Admission lease released -> capacity freed for the queued sibling.
    assert _admission_lease_count(exec_a) == 0, "drill=crash: admission lease must be released"
    released_again = lock_lifecycle.release_for_execution(execution)
    assert released_again == {"released": 0}, "drill=crash: lock release must be idempotent"
    next_claim = _claim("drill-worker-2", project_id)
    assert next_claim, "drill=crash: the queued sibling must be claimable after recovery"

    from storage.metrics_counters import get as counter
    assert counter("recovery_terminalized_total") >= 1


def test_drill_worker_queue_recovery_requeues_and_counts(data_dir):
    """UC477 durable-queue recovery requeues running rows and bumps the
    recovery counter."""
    from services.worker_recovery import recover_interrupted_queue

    eid, pid = f"drill-q-{uuid.uuid4().hex[:8]}", "drill-q-project"
    now = time.time()
    pg.execute(
        "INSERT INTO running_executions (execution_id, project_id, worker_id, started_at) "
        "VALUES (%s, %s, %s, %s)",
        (eid, pid, "drill-worker-q", now),
    )

    result = recover_interrupted_queue(pid)
    assert result["success"] is True
    assert eid in result["recovered_run_ids"], "drill=queue-recovery: the running row must be requeued"

    row = pg.query_one("SELECT status FROM execution_locations WHERE execution_id = %s", (eid,))
    assert row and row["status"] == "queued"
    assert not pg.query_one("SELECT 1 FROM running_executions WHERE execution_id = %s", (eid,))

    from storage.metrics_counters import get as counter
    assert counter("recovery_requeued_total") >= 1


# ---------------------------------------------------------------------------
# Drill 2: provider timeout -> bounded retry + terminal audit
# ---------------------------------------------------------------------------

def test_drill_provider_timeout_terminal_audit(data_dir):
    """A provider timing out yields a terminal PROVIDER_TIMEOUT result (never
    a hang) and increments the provider-error counter."""
    from services.runtime_provider import RuntimeProviderTimeoutError
    from services.runtime_providers.mock import MockRuntimeProvider
    from services.runtime_registry import RuntimeProviderRegistry
    from storage.metrics_counters import get as counter

    provider = MockRuntimeProvider()
    provider.configure_failure(RuntimeProviderTimeoutError())
    registry = RuntimeProviderRegistry([provider])

    result = registry.deploy("mock", f"drill-op-{uuid.uuid4().hex[:6]}", {"name": "drill-svc"})
    assert result.success is False, "drill=provider-timeout: the deploy must fail terminally"
    assert (result.error or {}).get("code") == "PROVIDER_TIMEOUT", (
        f"drill=provider-timeout: expected PROVIDER_TIMEOUT, got {(result.error or {}).get('code')}"
    )
    assert counter("provider_errors_total") >= 1


def test_drill_retry_engine_is_bounded(data_dir):
    """The backoff engine stops after max_retries attempts and re-raises (UC583)."""
    from services.retry_engine import retry_with_jitter

    attempts = {"n": 0}

    def always_times_out():
        attempts["n"] += 1
        raise TimeoutError("provider unreachable")

    with pytest.raises(TimeoutError):
        retry_with_jitter(always_times_out, max_retries=3, base_delay=0.001, max_delay=0.002)
    assert attempts["n"] == 3, f"drill=retry: expected exactly 3 bounded attempts, got {attempts['n']}"


# ---------------------------------------------------------------------------
# Drill 3: webhook delivery failure -> bounded retries then DLQ
# ---------------------------------------------------------------------------

def test_drill_webhook_failure_retries_then_dlq(data_dir):
    """Persistent webhook failures dead-letter after the bounded retries and
    the failed delivery stays visible until cleared (UC404)."""
    from services.webhook_dispatcher import (
        clear_webhook_dlq,
        dispatch_webhook_with_dlq,
        list_webhook_dlq,
    )
    from storage.metrics_counters import get as counter

    calls = {"n": 0}

    def failing_sender(url, payload):
        calls["n"] += 1
        raise ConnectionError("delivery endpoint refused")

    payload = {"event": "execution.finished", "execution_id": "drill-wh-1"}
    result = dispatch_webhook_with_dlq(
        "http://127.0.0.1:9/unreachable", "execution.finished", payload,
        max_retries=3, sender_fn=failing_sender,
    )

    assert calls["n"] == 3, f"drill=webhook: expected 3 bounded attempts, got {calls['n']}"
    assert result["status"] == "dlq", f"drill=webhook: persistent failure must dead-letter, got {result['status']}"
    assert result["retries_attempted"] == 3

    dlq = list_webhook_dlq()
    entry = next((e for e in dlq if e.get("id") == result["dlq_id"]), None)
    assert entry is not None, "drill=webhook: the failed delivery must be visible in the DLQ"
    assert entry["event_type"] == "execution.finished"
    assert "refused" in str(entry.get("error", ""))
    assert counter("webhook_delivery_failures_total") >= 1

    clear_webhook_dlq(result["dlq_id"])
    assert not any(e.get("id") == result["dlq_id"] for e in list_webhook_dlq())


# ---------------------------------------------------------------------------
# Drill 4: DB reconnect + duplicate idempotency request
# ---------------------------------------------------------------------------

def test_drill_db_reconnect_duplicate_idempotency(data_dir):
    """A duplicate mutation replayed after a connection-pool reset returns the
    cached original response (UC458)."""
    from services.idempotency_store import check_or_set_idempotency
    from storage.metrics_counters import get as counter  # noqa: F401  (import sanity)

    key = f"drill-idem-{uuid.uuid4().hex[:8]}"
    response_payload = {"operation": {"id": "op-drill-1", "status": "queued"}}

    first = check_or_set_idempotency("drill_services", key, response_payload)
    assert first == {"cached": False, "saved": True}

    # Simulate the database connection dropping and being re-established.
    pg.reset_connection_pool()
    assert pg.ping(), "drill=reconnect: the pool must recover after a reset"

    duplicate = check_or_set_idempotency("drill_services", key)
    assert duplicate.get("cached") is True, "drill=idempotency: the duplicate must hit the cache"
    assert duplicate["response"] == response_payload, (
        "drill=idempotency: the replayed response must equal the original verbatim"
    )


# ---------------------------------------------------------------------------
# Drill 5: metrics surface for queue age and lock contention
# ---------------------------------------------------------------------------

def test_drill_metrics_surface_queue_age_and_lock_contention(data_dir):
    """Queue age, admission leases, and contention denials are observable
    through services.metrics.render_prometheus()."""
    from services import metrics

    pid = f"drill-metrics-{uuid.uuid4().hex[:6]}"
    _setup_project(pid, limit=1)
    now = time.time()
    pg.execute(
        "INSERT INTO queued_executions (execution_id, project_id, queued_at) VALUES (%s, %s, %s)",
        (f"drill-mq-{uuid.uuid4().hex[:6]}", pid, now - 120),
    )

    age = metrics.queue_oldest_queued_seconds()
    assert age >= 120, f"drill=metrics: oldest queued execution must be at least 120s old, got {age}"

    with pg.transaction() as conn:
        first = project_admission.admit(
            conn, pid, limit=1, kind="service_operation", reference_id=f"{pid}-op-1", worker_id="w1",
        )
        denied = project_admission.admit(
            conn, pid, limit=1, kind="service_operation", reference_id=f"{pid}-op-2", worker_id="w2",
        )
    assert first is not None and denied is None, "drill=metrics: the second admission at cap 1 must be denied"

    rendered = metrics.render_prometheus()
    for series in (
        "radas_queue_oldest_queued_seconds",
        "radas_admission_leases_active",
        "radas_lock_contention_denials_total",
        "radas_recovery_terminalized_total",
        "radas_recovery_requeued_total",
        "radas_provider_errors_total",
        "radas_webhook_delivery_failures_total",
    ):
        assert series in rendered, f"drill=metrics: {series} must be rendered"

    assert metrics.admission_leases_active() >= 1
    from storage.metrics_counters import get as counter
    assert counter("lock_contention_denials_total") >= 1
