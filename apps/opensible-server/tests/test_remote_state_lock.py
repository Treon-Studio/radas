"""Tests for remote state locking (UC331)."""
import pytest
import time
import threading
from unittest.mock import patch

from services import remote_state_lock
from storage import pg


@pytest.fixture(scope="function")
def with_lock_table(pg_db):
    """Ensure the remote_state_locks table exists before tests."""
    with pg.transaction() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS remote_state_locks (
            id TEXT PRIMARY KEY,
            stack TEXT NOT NULL,
            backend_type TEXT NOT NULL,
            backend_key TEXT NOT NULL,
            actor TEXT,
            operation TEXT NOT NULL,
            run_id TEXT,
            acquired_at REAL NOT NULL,
            expires_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_remote_state_locks_stack_backend ON remote_state_locks(stack, backend_type, backend_key);
        CREATE INDEX IF NOT EXISTS idx_remote_state_locks_expires ON remote_state_locks(expires_at);
        """)
    yield


@pytest.fixture(scope="function")
def setup_stack(pg_db, with_lock_table):
    stack = "test-stack"
    backend_type = "s3"
    backend_key = "test-bucket/test-key.tfstate"
    return stack, backend_type, backend_key


def test_acquire_and_release(setup_stack):
    stack, backend_type, backend_key = setup_stack
    # Acquire
    lock = remote_state_lock.acquire(stack, backend_type, backend_key, actor="test", operation="apply")
    assert lock["ok"] is True
    assert "lock" in lock
    lock_id = lock["lock"]["id"]
    assert lock["lock"]["stack"] == stack
    assert lock["lock"]["backend_type"] == backend_type
    assert lock["lock"]["backend_key"] == backend_key

    # Try to acquire again
    lock2 = remote_state_lock.acquire(stack, backend_type, backend_key, actor="test2", operation="destroy")
    assert lock2["ok"] is False
    assert "lock" in lock2
    assert lock2["lock"]["id"] == lock_id

    # Release
    released = remote_state_lock.release(stack, backend_type, backend_key, lock_id=lock_id)
    assert released["ok"] is True
    assert released["released"] is True

    # Acquire after release
    lock3 = remote_state_lock.acquire(stack, backend_type, backend_key, actor="test3", operation="refresh")
    assert lock3["ok"] is True


def test_expired_lock_cleanup(setup_stack):
    stack, backend_type, backend_key = setup_stack
    with patch('time.time', return_value=1000):
        lock = remote_state_lock.acquire(stack, backend_type, backend_key, actor="test", operation="apply")
        assert lock["ok"] is True
    with patch('time.time', return_value=5000):  # after expiry (3600s)
        existing = remote_state_lock.get_lock(stack, backend_type, backend_key)
        assert existing is None
        cleaned = remote_state_lock.cleanup_expired()
        assert cleaned == 1


def test_concurrent_acquire_fails(setup_stack):
    stack, backend_type, backend_key = setup_stack
    lock_acquired = threading.Event()
    lock_released = threading.Event()

    def acquire_and_hold():
        lock = remote_state_lock.acquire(stack, backend_type, backend_key, actor="thread1", operation="apply")
        assert lock["ok"] is True
        lock_acquired.set()
        lock_released.wait(timeout=10)
        remote_state_lock.release(stack, backend_type, backend_key, lock_id=lock["lock"]["id"])

    t = threading.Thread(target=acquire_and_hold)
    t.start()
    lock_acquired.wait(timeout=5)

    lock2 = remote_state_lock.acquire(stack, backend_type, backend_key, actor="thread2", operation="destroy")
    assert lock2["ok"] is False

    lock_released.set()
    t.join()

    lock3 = remote_state_lock.acquire(stack, backend_type, backend_key, actor="thread3", operation="refresh")
    assert lock3["ok"] is True
    remote_state_lock.release(stack, backend_type, backend_key, lock_id=lock3["lock"]["id"])