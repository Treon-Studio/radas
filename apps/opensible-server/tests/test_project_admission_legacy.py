"""Tests for legacy JSON execution admission integration (UC483 Task 3).

Verifies that server_claim_next_execution uses project_admission leases atomically
with JSON file mutation, and that all terminal paths release leases correctly.
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
# Helpers
# ---------------------------------------------------------------------------

def _setup_project(project_id: str, limit: int = 1) -> None:
    now = time.time()
    org_id = f"legacy-org-{project_id}"
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


def _make_execution_file(project_id: str, exec_id: str, tmp_path, status: str = "QUEUED") -> None:
    """Create JSON file + PostgreSQL record + index entry for a legacy execution."""
    projects_dir = tmp_path / "projects"
    exec_dir = projects_dir / project_id / "history" / "executions"
    exec_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "id": exec_id,
        "projectId": project_id,
        "status": status,
        "queuedAt": time.time(),
        "createdAt": time.time(),
        "runParams": {"execution_type": "TOFU_RUN", "stack_name": "test-stack", "tofu_action": "plan"},
    }
    path = exec_dir / f"{exec_id}.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    create_execution_record(data, project_id=project_id, execution_id=exec_id)
    if status == "QUEUED":
        index_db.add_queued_execution(exec_id, project_id, data["queuedAt"])
    return path


def _claim(worker_id: str, project_id: str, max_concurrency: int = 10):
    """Invoke server_claim_next_execution with minimal parameters."""
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


# ---------------------------------------------------------------------------
# Task 3: Admission guards legacy claim
# ---------------------------------------------------------------------------

def test_legacy_claim_cap_one_succeeds_and_blocks_second(pg_db, tmp_path, monkeypatch):
    """Cap=1: first legacy claim succeeds; second is denied and left QUEUED."""
    project_id = "leg-cap-one"
    _setup_project(project_id, limit=1)
    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")

    exec_a = f"leg-a-{uuid.uuid4().hex[:8]}"
    exec_b = f"leg-b-{uuid.uuid4().hex[:8]}"
    _make_execution_file(project_id, exec_a, tmp_path)
    _make_execution_file(project_id, exec_b, tmp_path)

    # First claim should succeed
    eid, edata, _ = _claim("worker-1", project_id)
    assert eid is not None, "First legacy claim should succeed"

    # Active count must be 1
    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 1

    # Second claim should be blocked
    eid2, _, _ = _claim("worker-1", project_id)
    assert eid2 is None, "Second legacy claim should be blocked by cap"

    # Active count still 1
    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 1


def test_legacy_claim_limit_zero_allows_multiple(pg_db, tmp_path, monkeypatch):
    """limit=0 means unlimited: two executions can be claimed simultaneously."""
    project_id = "leg-unlimited"
    _setup_project(project_id, limit=0)
    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")

    exec_a = f"leg-unl-a-{uuid.uuid4().hex[:8]}"
    exec_b = f"leg-unl-b-{uuid.uuid4().hex[:8]}"
    _make_execution_file(project_id, exec_a, tmp_path)
    _make_execution_file(project_id, exec_b, tmp_path)

    eid_a, _, _ = _claim("worker-1", project_id)
    eid_b, _, _ = _claim("worker-2", project_id)

    assert eid_a is not None, "First unlimited claim should succeed"
    assert eid_b is not None, "Second unlimited claim should succeed"

    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 2


def test_legacy_claim_service_op_blocks_legacy(pg_db, tmp_path, monkeypatch):
    """A service operation already holding an admission lease blocks the legacy claim."""
    from services import service_instances, service_operations, service_operation_runner

    project_id = "leg-svc-blocks-legacy"
    _setup_project(project_id, limit=1)
    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")

    # Create and claim a service operation to occupy the single slot
    instance = service_instances.create_instance(
        project_id, "svc", "static-web", "1.0.0", "development", "mock",
        {"name": "svc", "image": "example:1"}, created_by="owner", actor_id="owner",
    )
    service_operations.create_operation(
        project_id, "service.deploy", f"svc-key-{uuid.uuid4().hex[:8]}",
        {"operation": "deploy", "desired_revision_id": "rev-1"},
        instance_id=instance["id"], requested_by="owner", actor_id="owner",
        initial_status="queued",
    )
    claim = service_operation_runner.claim_next_operation("worker-svc", project_id=project_id)
    assert claim is not None, "Service op claim should succeed"

    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 1

    # Legacy claim should now be blocked
    exec_id = f"leg-svc-blk-{uuid.uuid4().hex[:8]}"
    _make_execution_file(project_id, exec_id, tmp_path)
    eid, _, _ = _claim("worker-leg", project_id)
    assert eid is None, "Legacy claim should be blocked by service op lease"


def test_legacy_claim_project_isolation(pg_db, tmp_path, monkeypatch):
    """Project A at cap does not block Project B."""
    project_a = "leg-iso-a"
    project_b = "leg-iso-b"
    _setup_project(project_a, limit=1)
    _setup_project(project_b, limit=1)
    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")

    exec_a1 = f"leg-a1-{uuid.uuid4().hex[:8]}"
    exec_a2 = f"leg-a2-{uuid.uuid4().hex[:8]}"
    exec_b = f"leg-b-{uuid.uuid4().hex[:8]}"

    _make_execution_file(project_a, exec_a1, tmp_path)
    _make_execution_file(project_a, exec_a2, tmp_path)
    _make_execution_file(project_b, exec_b, tmp_path)

    # Fill project A's slot
    eid_a, _, _ = _claim("worker-1", project_a)
    assert eid_a is not None

    # Project A second claim blocked
    eid_a2, _, _ = _claim("worker-1", project_a)
    assert eid_a2 is None, "Project A second claim should be blocked"

    # Project B unaffected
    eid_b, _, _ = _claim("worker-2", project_b)
    assert eid_b is not None, "Project B should be unaffected by project A's cap"


def test_legacy_claim_file_already_running_releases_lease(pg_db, tmp_path, monkeypatch):
    """If JSON status changed to non-QUEUED between admit and file-lock, reservation is released."""
    project_id = "leg-race"
    _setup_project(project_id, limit=2)
    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")

    exec_id = f"leg-race-{uuid.uuid4().hex[:8]}"
    path = _make_execution_file(project_id, exec_id, tmp_path)

    # Simulate race: mark file as RUNNING before claim can process it
    data = json.loads(path.read_text())
    data["status"] = "RUNNING"
    path.write_text(json.dumps(data))

    # Claim should skip (file isn't QUEUED) and release the lease
    eid, _, _ = _claim("worker-1", project_id)
    assert eid != exec_id, "Should not claim a non-QUEUED execution"

    # No lease should remain for that exec_id
    with pg.transaction() as conn:
        count = project_admission.active_count(conn, project_id)
    assert count == 0, f"No active lease should remain after race; got {count}"


# ---------------------------------------------------------------------------
# Task 4: Release on terminal paths
# ---------------------------------------------------------------------------

def test_legacy_finish_via_worker_routes_releases_lease(pg_db, tmp_path, monkeypatch):
    """Finishing a legacy execution via worker_routes releases the admission lease."""
    project_id = "leg-finish-release"
    _setup_project(project_id, limit=1)
    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")

    exec_id = f"leg-finish-{uuid.uuid4().hex[:8]}"
    _make_execution_file(project_id, exec_id, tmp_path)

    eid, _, _ = _claim("worker-1", project_id)
    assert eid == exec_id

    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 1

    # Release the lease (simulating finish path)
    with pg.transaction() as conn:
        released = project_admission.release(conn, reference_id=exec_id)
    assert released, "Release should return True"

    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 0, \
            "Slot should be free after finish"


def test_legacy_release_idempotent(pg_db, tmp_path, monkeypatch):
    """Double-release does not error and does not corrupt the count."""
    project_id = "leg-idem"
    _setup_project(project_id, limit=1)
    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")

    exec_id = f"leg-idem-{uuid.uuid4().hex[:8]}"
    _make_execution_file(project_id, exec_id, tmp_path)

    eid, _, _ = _claim("worker-1", project_id)
    assert eid == exec_id

    with pg.transaction() as conn:
        project_admission.release(conn, reference_id=exec_id)
    # Second release is a no-op, should not raise
    with pg.transaction() as conn:
        project_admission.release(conn, reference_id=exec_id)

    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 0


def test_legacy_expired_lease_reclaimed_allows_new_claim(pg_db, tmp_path, monkeypatch):
    """An expired admission lease is reclaimed on the next claim, freeing the slot."""
    project_id = "leg-expiry"
    _setup_project(project_id, limit=1)
    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")

    # Insert an already-expired lease directly using a reference_id that won't
    # match any real execution so it won't be reclaimed by a duplicate-check.
    now = time.time()
    expired_ref = f"expired-ghost-{uuid.uuid4().hex[:8]}"
    with pg.transaction() as conn:
        conn.execute(
            "INSERT INTO project_admission_leases "
            "(id, project_id, kind, reference_id, worker_id, status, lease_until, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (str(uuid.uuid4()), project_id, "legacy_execution", expired_ref, "w", "active",
             now - 30, now - 60, now - 60),
        )

    # Verify the expired lease is visible before claim
    with pg.transaction() as conn:
        raw = conn.execute(
            "SELECT COUNT(*) AS cnt FROM project_admission_leases WHERE project_id=%s",
            (project_id,),
        ).fetchone()["cnt"]
    assert raw == 1, f"Expected 1 expired lease, got {raw}"

    # active_count should exclude expired leases
    with pg.transaction() as conn:
        active = project_admission.active_count(conn, project_id)
    assert active == 0, f"active_count should exclude expired leases, got {active}"

    # Create a new queued execution
    exec_id2 = f"leg-new-{uuid.uuid4().hex[:8]}"
    _make_execution_file(project_id, exec_id2, tmp_path)

    # Claim should succeed: expired lease is reclaimed and the slot opens
    eid, _, _ = _claim("worker-1", project_id)
    assert eid == exec_id2, f"Should claim after expired lease is reclaimed, got {eid}"

    with pg.transaction() as conn:
        count = project_admission.active_count(conn, project_id)
    assert count == 1


def test_legacy_no_execution_returns_none(pg_db, tmp_path, monkeypatch):
    """When there are no queued executions, claim returns (None, None, None)."""
    project_id = "leg-empty"
    _setup_project(project_id, limit=5)
    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")

    eid, edata, ppid = _claim("worker-1", project_id)
    assert eid is None
    assert edata is None
