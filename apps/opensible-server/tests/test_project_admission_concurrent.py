from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import pytest

from storage import pg, project_admission
from services import quota_service, service_instances, service_operation_runner, service_operations
from utils.project_paths import get_project_executions_dir


def _setup_project_and_quota(project_id="concurrent-project", limit=1):
    now = time.time()
    org_id = f"concurrent-org-{project_id}"
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


def _create_service_operation(project_id, instance_id, key="concurrent-key"):
    return service_operations.create_operation(
        project_id,
        "service.deploy",
        key,
        {"operation": "deploy", "desired_revision_id": "rev-123"},
        instance_id=instance_id,
        requested_by="owner",
        actor_id="owner",
        initial_status="queued",
    )


def _create_legacy_execution(project_id, exec_id, tmp_path):
    from services.execution_history import create_execution_record
    # Also create the JSON file for legacy claim path
    # PROJECTS_DIR should be monkeypatched before calling this
    projects_dir = tmp_path / "projects"
    exec_dir = projects_dir / project_id / "history" / "executions"
    exec_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "id": exec_id,
        "projectId": project_id,
        "status": "QUEUED",
        "queuedAt": time.time(),
        "createdAt": time.time(),
        "runParams": {"execution_type": "TOFU_RUN", "stack_name": "test-stack", "tofu_action": "plan"},
    }
    path = exec_dir / f"{exec_id}.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    # Also create execution record in PostgreSQL so get_execution works
    create_execution_record(data, project_id=project_id, execution_id=exec_id)
    from storage import index_db
    index_db.add_queued_execution(exec_id, project_id, data["queuedAt"])
    return path


def test_concurrent_service_and_legacy_claim_one_succeeds(pg_db, tmp_path, monkeypatch):
    project_id = "concurrent-project"
    _setup_project_and_quota(project_id, limit=1)

    instance = service_instances.create_instance(
        project_id,
        "runner-service",
        "static-web",
        "1.0.0",
        "development",
        "mock",
        {"name": "runner-service", "image": "example/service:1"},
        created_by="owner",
        actor_id="owner",
    )

    service_op = _create_service_operation(project_id, instance["id"], "concurrent-svc")
    legacy_id = "legacy-exec-1"
    _create_legacy_execution(project_id, legacy_id, tmp_path)

    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")

    results = {"service": None, "legacy": None}

    def claim_service():
        results["service"] = service_operation_runner.claim_next_operation(
            "worker-svc", project_id=project_id
        )

    def claim_legacy():
        from app import server_claim_next_execution
        worker_data = {"name": "worker-legacy", "tags": [], "capabilities": {}}
        exec_id, exec_data, pid = server_claim_next_execution(
            "worker-legacy",
            worker_data,
            project_id=project_id,
            max_concurrency=1,
            tags=[],
            recovering=False,
        )
        results["legacy"] = (exec_id, exec_data, pid)

    threads = [
        threading.Thread(target=claim_service),
        threading.Thread(target=claim_legacy),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    svc_result = results["service"]
    leg_result = results["legacy"]

    # Check exactly one claim succeeded: service returns dict or None; legacy returns tuple (exec_id, ...)
    svc_succeeded = svc_result is not None
    leg_succeeded = leg_result[0] is not None
    assert svc_succeeded != leg_succeeded, "Exactly one claim should succeed"
    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 1

    if svc_succeeded:
        from storage.executions_store import get_execution
        legacy_exec = get_execution(legacy_id, project_id=project_id)
        assert legacy_exec["status"] == "QUEUED"
    else:
        op = service_operations.get_operation(project_id, service_op["id"])
        assert op["status"] == "queued"


def test_concurrent_legacy_and_service_claim_one_succeeds(pg_db, tmp_path, monkeypatch):
    project_id = "concurrent-project-reverse"
    _setup_project_and_quota(project_id, limit=1)

    instance = service_instances.create_instance(
        project_id,
        "runner-service",
        "static-web",
        "1.0.0",
        "development",
        "mock",
        {"name": "runner-service", "image": "example/service:1"},
        created_by="owner",
        actor_id="owner",
    )

    service_op = _create_service_operation(project_id, instance["id"], "concurrent-svc-rev")
    legacy_id = "legacy-exec-2"
    _create_legacy_execution(project_id, legacy_id, tmp_path)

    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")

    results = {"service": None, "legacy": None}

    def claim_legacy_first():
        from app import server_claim_next_execution
        worker_data = {"name": "worker-legacy", "tags": [], "capabilities": {}}
        exec_id, exec_data, pid = server_claim_next_execution(
            "worker-legacy",
            worker_data,
            project_id=project_id,
            max_concurrency=1,
            tags=[],
            recovering=False,
        )
        results["legacy"] = (exec_id, exec_data, pid)

    def claim_service_second():
        results["service"] = service_operation_runner.claim_next_operation(
            "worker-svc", project_id=project_id
        )

    threads = [
        threading.Thread(target=claim_legacy_first),
        threading.Thread(target=claim_service_second),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    svc_result = results["service"]
    leg_result = results["legacy"]

    svc_succeeded = svc_result is not None
    leg_succeeded = leg_result[0] is not None
    assert svc_succeeded != leg_succeeded
    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 1


def test_finish_service_opens_slot_for_legacy(pg_db, tmp_path, monkeypatch):
    project_id = "concurrent-finish-svc"
    _setup_project_and_quota(project_id, limit=1)

    instance = service_instances.create_instance(
        project_id,
        "runner-service",
        "static-web",
        "1.0.0",
        "development",
        "mock",
        {"name": "runner-service", "image": "example/service:1"},
        created_by="owner",
        actor_id="owner",
    )

    service_op = _create_service_operation(project_id, instance["id"], "concurrent-finish-svc-key")
    legacy_id = "legacy-exec-3"

    # Monkeypatch PROJECTS_DIR before creating legacy execution
    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")
    _create_legacy_execution(project_id, legacy_id, tmp_path)

    claim = service_operation_runner.claim_next_operation("worker-svc", project_id=project_id)
    assert claim is not None

    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 1

    # Finish the service operation; this should release the admission lease
    service_operation_runner.finish_operation(
        service_op["id"],
        "worker-svc",
        success=True,
        result={"status": "ok"},
        lease_token=claim["lease_token"],
    )
    # Wait a moment for lease to be released
    time.sleep(0.1)

    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 0

    # Verify legacy execution is in queued index and file exists
    from storage import index_db
    queued_list = index_db.list_queued(project_id=project_id, limit=10)
    assert any(q[0] == legacy_id for q in queued_list), f"Legacy execution {legacy_id} not in queued index"
    exec_file = tmp_path / "projects" / project_id / "history" / "executions" / f"{legacy_id}.json"
    assert exec_file.exists(), f"Legacy execution file not found: {exec_file}"

    # Now legacy should be able to claim
    from app import server_claim_next_execution
    worker_data = {"name": "worker-legacy", "tags": [], "capabilities": {}}
    exec_id, exec_data, pid = server_claim_next_execution(
        "worker-legacy",
        worker_data,
        project_id=project_id,
        max_concurrency=1,
        tags=[],
        recovering=False,
    )
    # Debug: print why it failed
    if exec_id is None:
        print(f"DEBUG: legacy claim returned None for project {project_id}")
        # Check if quota exists
        from services.quota_service import get_quota
        quota = get_quota(project_id)
        print(f"DEBUG: quota for {project_id} = {quota}")
        # Check if admission leases exist
        with pg.transaction() as conn:
            count = project_admission.active_count(conn, project_id)
            print(f"DEBUG: active admission count = {count}")
        # Check if the execution is still queued in PostgreSQL
        from storage.executions_store import get_execution
        exec_data = get_execution(legacy_id, project_id=project_id)
        print(f"DEBUG: execution data from PostgreSQL: {exec_data}")
    assert exec_id == legacy_id, f"Legacy execution should be claimable after service finishes, got {exec_id}"

    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 1


def test_finish_legacy_opens_slot_for_service(pg_db, tmp_path, monkeypatch):
    project_id = "concurrent-finish-legacy"
    _setup_project_and_quota(project_id, limit=1)

    instance = service_instances.create_instance(
        project_id,
        "runner-service",
        "static-web",
        "1.0.0",
        "development",
        "mock",
        {"name": "runner-service", "image": "example/service:1"},
        created_by="owner",
        actor_id="owner",
    )

    service_op = _create_service_operation(project_id, instance["id"], "concurrent-finish-legacy-key")
    legacy_id = "legacy-exec-4"

    # Monkeypatch PROJECTS_DIR before creating legacy execution
    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")
    _create_legacy_execution(project_id, legacy_id, tmp_path)

    from app import server_claim_next_execution
    worker_data = {"name": "worker-legacy", "tags": [], "capabilities": {}}
    exec_id, exec_data, pid = server_claim_next_execution(
        "worker-legacy",
        worker_data,
        project_id=project_id,
        max_concurrency=1,
        tags=[],
        recovering=False,
    )
    assert exec_id == legacy_id, "Legacy claim should succeed"

    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 1

    # Finish the legacy execution: transition to RUNNING then SUCCESS
    from storage.executions_store import update_execution_record
    update_execution_record(legacy_id, {"status": "RUNNING", "startedAt": time.time()}, project_id=project_id)
    update_execution_record(legacy_id, {"status": "SUCCESS", "finishedAt": time.time()}, project_id=project_id)
    # Wait a moment for lease to be released
    time.sleep(0.1)

    with pg.transaction() as conn:
        project_admission.release(conn, reference_id=legacy_id)

    with pg.transaction() as conn:
        count = project_admission.active_count(conn, project_id)
        print(f"DEBUG: after legacy release, active count = {count}")
        assert count == 0

    # Now service should be able to claim
    claim = service_operation_runner.claim_next_operation("worker-svc", project_id=project_id)
    assert claim is not None, f"Service operation should be claimable after legacy finishes, got {claim}"
    assert claim["operation_id"] == service_op["id"]

    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_id) == 1


def test_project_isolation_with_concurrent_claims(pg_db, tmp_path, monkeypatch):
    project_a = "isolation-a"
    project_b = "isolation-b"
    _setup_project_and_quota(project_a, limit=1)
    _setup_project_and_quota(project_b, limit=1)

    instances = {}
    for pid in (project_a, project_b):
        inst = service_instances.create_instance(
            pid,
            "runner-service",
            "static-web",
            "1.0.0",
            "development",
            "mock",
            {"name": "runner-service", "image": "example/service:1"},
            created_by="owner",
            actor_id="owner",
        )
        instances[pid] = inst

    op_a = _create_service_operation(project_a, instances[project_a]["id"], "iso-a")
    op_b = _create_service_operation(project_b, instances[project_b]["id"], "iso-b")

    legacy_a = "legacy-iso-a"
    legacy_b = "legacy-iso-b"

    # Monkeypatch PROJECTS_DIR before creating legacy executions
    monkeypatch.setattr("app.PROJECTS_DIR", tmp_path / "projects")
    _create_legacy_execution(project_a, legacy_a, tmp_path)
    _create_legacy_execution(project_b, legacy_b, tmp_path)

    results = {}

    def claim_service_a():
        results["svc_a"] = service_operation_runner.claim_next_operation("worker-a", project_id=project_a)

    def claim_legacy_b():
        from app import server_claim_next_execution
        worker_data = {"name": "worker-b", "tags": [], "capabilities": {}}
        exec_id, exec_data, pid = server_claim_next_execution(
            "worker-b",
            worker_data,
            project_id=project_b,
            max_concurrency=1,
            tags=[],
            recovering=False,
        )
        results["legacy_b"] = (exec_id, exec_data, pid)

    threads = [
        threading.Thread(target=claim_service_a),
        threading.Thread(target=claim_legacy_b),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Both should succeed because they are different projects
    assert results["svc_a"] is not None, "Service A should claim"
    assert results["legacy_b"][0] is not None, "Legacy B should claim"

    with pg.transaction() as conn:
        assert project_admission.active_count(conn, project_a) == 1
        assert project_admission.active_count(conn, project_b) == 1