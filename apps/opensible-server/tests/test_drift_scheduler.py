from __future__ import annotations

import pytest
import time
from unittest.mock import MagicMock, patch

from services.drift_scheduler import (
    run_drift_check_for_stack,
    discover_drift_schedules,
    reconcile_drift_jobs,
    complete_scheduled_drift,
)
from services.cloud_provisioning import get_drift_schedule, set_drift_schedule, _load_meta


def test_run_drift_check_disabled(pg_db):
    """When schedule is disabled, run_drift_check_for_stack returns 'disabled'."""
    project_id = "test-proj"
    stack = "test-stack"
    set_drift_schedule(project_id, stack, {"enabled": False, "cron": "0 2 * * *"})

    result = run_drift_check_for_stack(project_id, stack)
    assert result["status"] == "disabled"
    assert result["stack"] == stack


def test_run_drift_check_drifted_sends_alert(pg_db, monkeypatch):
    """When drift is detected, an alert is sent via dispatch_event."""
    project_id = "test-proj"
    stack = "test-stack"
    set_drift_schedule(project_id, stack, {"enabled": True, "cron": "0 2 * * *", "alert_on_drift": True})

    # Mock _drift_status to return drifted
    mock_drift_status = MagicMock(return_value={"status": "drifted", "diff": ["resource changed"]})
    monkeypatch.setattr("services.drift_scheduler._drift_status", mock_drift_status)

    # Mock dispatch_event
    mock_dispatch = MagicMock()
    monkeypatch.setattr("services.drift_scheduler.dispatch_event", mock_dispatch)

    result = run_drift_check_for_stack(project_id, stack)
    assert result["status"] == "drifted"
    assert result["diff"] == ["resource changed"]

    # Verify alert was sent
    mock_dispatch.assert_called_once()
    args, kwargs = mock_dispatch.call_args
    assert args[0] == "drift.detected"
    payload = args[1]
    assert payload["project_id"] == project_id
    assert payload["stack"] == stack
    assert payload["status"] == "drifted"
    assert payload["diff"] == ["resource changed"]
    assert "timestamp" in payload

    # Verify last_scheduled_check was updated in stack_meta
    meta = _load_meta(project_id, stack)
    assert "drift" in meta
    assert "last_scheduled_check" in meta["drift"]
    assert isinstance(meta["drift"]["last_scheduled_check"], int)


def test_run_drift_check_in_sync_no_alert(pg_db, monkeypatch):
    """When no drift, no alert is sent."""
    project_id = "test-proj"
    stack = "test-stack"
    set_drift_schedule(project_id, stack, {"enabled": True, "cron": "0 2 * * *", "alert_on_drift": True})

    mock_drift_status = MagicMock(return_value={"status": "in_sync", "diff": []})
    monkeypatch.setattr("services.drift_scheduler._drift_status", mock_drift_status)

    mock_dispatch = MagicMock()
    monkeypatch.setattr("services.drift_scheduler.dispatch_event", mock_dispatch)

    result = run_drift_check_for_stack(project_id, stack)
    assert result["status"] == "in_sync"

    # No alert sent
    mock_dispatch.assert_not_called()


def test_run_drift_check_alert_off(pg_db, monkeypatch):
    """When alert_on_drift is false, no alert is sent even if drift detected."""
    project_id = "test-proj"
    stack = "test-stack"
    set_drift_schedule(project_id, stack, {"enabled": True, "cron": "0 2 * * *", "alert_on_drift": False})

    mock_drift_status = MagicMock(return_value={"status": "drifted", "diff": ["resource changed"]})
    monkeypatch.setattr("services.drift_scheduler._drift_status", mock_drift_status)

    mock_dispatch = MagicMock()
    monkeypatch.setattr("services.drift_scheduler.dispatch_event", mock_dispatch)

    result = run_drift_check_for_stack(project_id, stack)
    assert result["status"] == "drifted"
    mock_dispatch.assert_not_called()


def test_discover_and_reconcile_enabled_schedule(pg_db, monkeypatch, tmp_path):
    from services import drift_scheduler
    project_id = "test-proj"
    stack = "test-stack"
    set_drift_schedule(project_id, stack, {"enabled": True, "cron": "0 2 * * *"})
    monkeypatch.setattr(drift_scheduler, "_stack_dir", lambda _pid, _stack: tmp_path)
    scheduler = drift_scheduler.BackgroundScheduler(timezone="UTC")
    drift_scheduler._scheduler = scheduler
    scheduler.start()
    try:
        assert len(discover_drift_schedules()) == 1
        reconcile_drift_jobs()
        job = scheduler.get_job("drift:test-proj:test-stack")
        assert job is not None
        assert tuple(job.args) == (project_id, stack)
    finally:
        scheduler.shutdown()
        drift_scheduler._scheduler = None


def test_complete_scheduled_drift_alerts_only_on_code_two(pg_db, monkeypatch):
    project_id = "test-proj"
    stack = "test-stack"
    set_drift_schedule(project_id, stack, {"enabled": True, "cron": "0 2 * * *", "alert_on_drift": True})
    dispatch = MagicMock()
    monkeypatch.setattr("services.drift_scheduler.dispatch_event", dispatch)
    execution = {"id": "run-1", "projectId": project_id, "runParams": {
        "execution_type": "TOFU_RUN", "tofu_action": "drift", "stack_name": stack, "scheduled_drift": True,
    }}
    complete_scheduled_drift(execution, "SUCCESS", 2, 100)
    dispatch.assert_called_once()
    assert dispatch.call_args.args[0] == "stack.drifted"
    dispatch.reset_mock()
    complete_scheduled_drift(execution, "SUCCESS", 0, 101)
    dispatch.assert_not_called()


def test_scheduler_start_stop():
    """Starting and stopping the scheduler should not raise exceptions."""
    from services.drift_scheduler import start_drift_scheduler, stop_drift_scheduler

    start_drift_scheduler()
    # Should not crash if called twice
    start_drift_scheduler()

    stop_drift_scheduler()
    # Should not crash if called twice
    stop_drift_scheduler()
