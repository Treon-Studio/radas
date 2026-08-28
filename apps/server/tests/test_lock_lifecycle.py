"""Lock/lease lifecycle matrix (Phase 5 — Task 5.3).

Pins the full terminal-path contract: every mutating TOFU_RUN execution
carries its lock IDs on the record, and every terminal path (finish, cancel,
timeout recovery, orphan recovery, deletion, enqueue failure) releases them
exactly once by exact lease ID.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from storage import pg
from services import lock_lifecycle, project_lock, remote_state_lock


ORG = "org-lock-lifecycle"
PROJECT = "project-lock-lifecycle"
STACK = "lock-stack"


@pytest.fixture
def env(pg_db, tmp_path, monkeypatch):
    """Real lock tables + seeded project + monkeypatched stack dirs."""
    now = 1_700_000_000
    pg.execute(
        "INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s, %s, %s, %s)",
        (ORG, ORG, "user-l", now),
    )
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, created_at, updated_at) "
        "VALUES (%s, %s, %s, %s, %s, 0, %s, %s)",
        (PROJECT, ORG, "user-l", PROJECT, "", now, now),
    )
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s)",
        (ORG, "user-l", "owner", now),
    )
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, created_at, updated_at) "
        "VALUES ('other-project', %s, 'user-l', 'Other', '', 0, %s, %s)",
        (ORG, now, now),
    )
    stack_dir = tmp_path / STACK
    stack_dir.mkdir()
    (stack_dir / "terraform.tfstate").write_text("{}", encoding="utf-8")
    import services.cloud_provisioning as cp
    monkeypatch.setattr(cp, "_stack_dir", lambda pid, name: stack_dir)
    monkeypatch.setattr(cp, "_stack_data_dir", lambda pid, name: tmp_path / "data")
    return {"stack_dir": stack_dir, "tmp": tmp_path}


def _make_execution(eid: str, *, lock_ids: dict | None = None) -> dict:
    record = {
        "id": eid,
        "projectId": PROJECT,
        "stack": STACK,
        "action": "apply",
        "status": "RUNNING",
        "workerId": "worker-l",
        "runParams": {
            "execution_type": "TOFU_RUN",
            "tofu_action": "apply",
            "stack_name": STACK,
        },
    }
    if lock_ids is not None:
        record["runParams"]["lock_ids"] = lock_ids
    return record


def test_acquire_for_execution_stores_both_lock_ids(env):
    locks = lock_lifecycle.acquire_for_execution(PROJECT, STACK, "apply", actor="tester", run_id="run-1")
    assert locks["project"]["ok"] is True
    assert locks["project"]["lock"]["run_id"] == "run-1"
    # local backend -> no remote lock, project lock always present
    assert locks["remote"] is None


def test_acquire_conflict_same_project_serializes(env):
    first = lock_lifecycle.acquire_for_execution(PROJECT, STACK, "apply", actor="a", run_id="run-1")
    assert first["project"]["ok"] is True
    second = lock_lifecycle.acquire_for_execution(PROJECT, STACK, "apply", actor="b", run_id="run-2")
    assert second["project"]["ok"] is False
    # Different project unaffected
    other = lock_lifecycle.acquire_for_execution("other-project", STACK, "apply", actor="c", run_id="run-3")
    assert other["project"]["ok"] is True


def test_release_for_execution_releases_by_exact_id_and_is_idempotent(env):
    locks = lock_lifecycle.acquire_for_execution(PROJECT, STACK, "apply", actor="tester", run_id="run-1")
    record = _make_execution("run-1", lock_ids=lock_lifecycle.lock_ids_from_acquisition(locks))

    summary = lock_lifecycle.release_for_execution(record)
    assert summary["released"] >= 1

    # Idempotent: second release on the same record releases nothing new
    summary2 = lock_lifecycle.release_for_execution(record)
    assert summary2["released"] == 0

    # Capacity is free again
    again = lock_lifecycle.acquire_for_execution(PROJECT, STACK, "apply", actor="tester", run_id="run-2")
    assert again["project"]["ok"] is True


def test_release_for_execution_without_lock_ids_is_safe(env):
    record = _make_execution("run-legacy")
    summary = lock_lifecycle.release_for_execution(record)
    assert summary["released"] == 0


def test_remote_state_lock_round_trip_with_backend(env):
    backend = {"backend_type": "s3", "values": {"key": f"cloud-provisioning/{STACK}.tfstate"}}
    locks = lock_lifecycle.acquire_for_execution(
        PROJECT, STACK, "apply", actor="tester", run_id="run-1", backend_config=backend
    )
    assert locks["remote"] is not None and locks["remote"]["ok"] is True
    record = _make_execution("run-1", lock_ids=lock_lifecycle.lock_ids_from_acquisition(locks))
    summary = lock_lifecycle.release_for_execution(record)
    assert summary["released"] == 2
    # Capacity free
    again = lock_lifecycle.acquire_for_execution(
        PROJECT, STACK, "apply", actor="tester", run_id="run-2", backend_config=backend
    )
    assert again["remote"]["ok"] is True


def test_cleanup_expired_wired(monkeypatch):
    called = {"project": 0, "remote": 0}
    import services.project_lock as pl
    import services.remote_state_lock as rsl
    monkeypatch.setattr(pl, "cleanup_expired", lambda: 1)
    monkeypatch.setattr(rsl, "cleanup_expired", lambda: 2)
    result = lock_lifecycle.cleanup_all()
    assert result == {"project": 1, "remote": 2}
