import pytest
from flask import Flask
from unittest.mock import patch

from services import onboarding_service
from storage import pg

USER_ID = "test-onboarding-user"


@pytest.fixture
def setup_user(pg_db):
    # onboarding_status comes from the canonical schema (pg_schema v1).
    # Create a test user
    now = 1234567890
    pg.execute(
        "INSERT INTO users (id, username, password_hash, is_active, created_at) VALUES (%s, %s, %s, %s, %s)",
        (USER_ID, "onboarding-test", "dummy-hash-for-testing", 1, now),
    )
    yield
    # Cleanup
    pg.execute("DELETE FROM onboarding_status WHERE user_id = %s", (USER_ID,))
    pg.execute("DELETE FROM users WHERE id = %s", (USER_ID,))


def test_onboarding_status_new_user(setup_user):
    status = onboarding_service.get_status(USER_ID)
    assert status["completed"] is False
    assert status["completed_at"] is None


def test_onboarding_mark_completed(setup_user):
    status = onboarding_service.mark_completed(USER_ID)
    assert status["completed"] is True
    assert status["completed_at"] is not None

    # Get again
    status2 = onboarding_service.get_status(USER_ID)
    assert status2["completed"] is True
    assert status2["completed_at"] == status["completed_at"]


def test_onboarding_reset(setup_user):
    onboarding_service.mark_completed(USER_ID)
    reset = onboarding_service.reset_onboarding(USER_ID)
    assert reset["completed"] is False
    assert reset["completed_at"] is None