"""Tests for project-level locking."""
import pytest
import time
import threading
from unittest.mock import patch

from services import project_lock
from storage import pg


@pytest.fixture(scope="function")
def with_lock_table(pg_db):
    """Ensure the project_locks table exists before tests."""
    with pg.transaction() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS project_locks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            actor TEXT,
            operation TEXT NOT NULL,
            run_id TEXT,
            acquired_at REAL NOT NULL,
            expires_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_project_locks_project_expires ON project_locks(project_id, expires_at);
        """)
    yield


@pytest.fixture(scope="function")
def setup_project(pg_db, with_lock_table):
    # Create a test project
    org_id = "test-org"
    proj_id = "test-proj"
    with pg.transaction() as conn:
        conn.execute("INSERT INTO orgs (id, name) VALUES (%s, %s) ON CONFLICT DO NOTHING", (org_id, "Test Org"))
        conn.execute("INSERT INTO projects (id, org_id, name) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                     (proj_id, org_id, "Test Project"))
    return proj_id


def test_acquire_and_release(setup_project):
    proj_id = setup_project
    # Acquire
    lock = project_lock.acquire(proj_id, actor="test", operation="apply")
    assert lock["ok"] is True
    assert "lock" in lock
    lock_id = lock["lock"]["id"]

    # Try to acquire again
    lock2 = project_lock.acquire(proj_id, actor="test2", operation="destroy")
    assert lock2["ok"] is False
    assert "lock" in lock2
    assert lock2["lock"]["id"] == lock_id

    # Release
    released = project_lock.release(proj_id, lock_id=lock_id)
    assert released["ok"] is True
    assert released["released"] is True

    # Acquire after release
    lock3 = project_lock.acquire(proj_id, actor="test3", operation="refresh")
    assert lock3["ok"] is True


def test_expired_lock_cleanup(setup_project):
    proj_id = setup_project
    # Acquire with short expiry (mock time)
    with patch('time.time', return_value=1000):
        lock = project_lock.acquire(proj_id, actor="test", operation="apply")
        assert lock["ok"] is True
    # Simulate time passing beyond expiry (3600s later, so 4600 expiry, use 5000)
    with patch('time.time', return_value=5000):  # after expiry
        # Should be expired
        existing = project_lock.get_lock(proj_id)
        assert existing is None
        # Cleanup should remove it
        cleaned = project_lock.cleanup_expired()
        assert cleaned == 1


def test_concurrent_acquire_fails(setup_project):
    proj_id = setup_project
    lock_acquired = threading.Event()
    lock_released = threading.Event()

    def acquire_and_hold():
        lock = project_lock.acquire(proj_id, actor="thread1", operation="apply")
        assert lock["ok"] is True
        lock_acquired.set()
        lock_released.wait(timeout=10)
        project_lock.release(proj_id, lock_id=lock["lock"]["id"])

    t = threading.Thread(target=acquire_and_hold)
    t.start()
    lock_acquired.wait(timeout=5)

    # Second acquire should fail
    lock2 = project_lock.acquire(proj_id, actor="thread2", operation="destroy")
    assert lock2["ok"] is False

    lock_released.set()
    t.join()

    # Now should succeed
    lock3 = project_lock.acquire(proj_id, actor="thread3", operation="refresh")
    assert lock3["ok"] is True
    project_lock.release(proj_id, lock_id=lock3["lock"]["id"])