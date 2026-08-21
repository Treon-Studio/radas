import pytest
from services.cloud_provisioning import get_drift_schedule, set_drift_schedule


def test_get_drift_schedule_returns_default():
    """When no schedule is set, get_drift_schedule returns default config."""
    project_id = "test_project"
    stack = "test_stack"
    default = {"enabled": False, "cron": None, "alert_on_drift": True}
    result = get_drift_schedule(project_id, stack)
    assert result == default


def test_set_drift_schedule_persists():
    """Setting a schedule stores it and get_drift_schedule returns it."""
    project_id = "test_project"
    stack = "test_stack"
    config = {"enabled": True, "cron": "0 0 * * *", "alert_on_drift": False}
    set_drift_schedule(project_id, stack, config)
    result = get_drift_schedule(project_id, stack)
    assert result == config


def test_set_drift_schedule_requires_cron_when_enabled():
    """Setting enabled=True without a cron raises ValueError."""
    project_id = "test_project"
    stack = "test_stack"
    config = {"enabled": True, "cron": None, "alert_on_drift": True}
    with pytest.raises(ValueError, match="cron"):
        set_drift_schedule(project_id, stack, config)