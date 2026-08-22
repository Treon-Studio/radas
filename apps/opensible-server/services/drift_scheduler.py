"""Cron-based drift detection scheduling and completion alerting."""
from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from services.cloud_provisioning import (
    _create_execution,
    _drift_status,
    _load_meta,
    _save_meta,
    get_drift_schedule,
    _stack_dir,
)
from services.webhook_dispatcher import dispatch_event

logger = logging.getLogger(__name__)

_scheduler: Optional[BackgroundScheduler] = None
_scheduler_lock = threading.Lock()
_JOB_PREFIX = "drift:"
_RECONCILE_JOB_ID = "drift:reconcile"


def _job_id(project_id: Optional[str], stack: str) -> str:
    return f"{_JOB_PREFIX}{project_id or 'default'}:{stack}"


def _scheduled_run(project_id: Optional[str], stack: str) -> Dict[str, Any]:
    """Queue one read-only drift execution for a scheduled stack."""
    schedule = get_drift_schedule(project_id, stack)
    if not schedule.get("enabled"):
        return {"status": "disabled", "stack": stack}
    if not _stack_dir(project_id, stack).is_dir():
        return {"status": "missing", "stack": stack}
    try:
        execution_id = _create_execution(
            project_id,
            stack,
            "drift",
            triggered_by="drift_schedule",
            extra_run_params={"scheduled_drift": True},
        )
    except Exception:
        logger.exception("Failed to queue scheduled drift check for %s", stack)
        return {"status": "error", "stack": stack}
    return {"status": "queued", "stack": stack, "run_id": execution_id}


def run_drift_check_for_stack(project_id: Optional[str], stack: str) -> Dict[str, Any]:
    """Return the latest drift status for legacy callers.

    New scheduled and manual API paths enqueue a fresh worker execution. This
    compatibility helper retains the prior status-only contract.
    """
    schedule = get_drift_schedule(project_id, stack)
    if not schedule.get("enabled"):
        return {"status": "disabled", "stack": stack}
    drift_result = _drift_status(project_id, stack)
    status = drift_result.get("status", "unknown")
    diff = drift_result.get("diff", [])
    meta = _load_meta(project_id, stack)
    drift_record = dict(meta.get("drift") or {})
    drift_record["last_scheduled_check"] = int(time.time())
    _save_meta(project_id, stack, drift=drift_record)
    if status == "drifted" and schedule.get("alert_on_drift", True):
        payload = {
            "project_id": project_id,
            "stack": stack,
            "status": status,
            "diff": diff,
            "timestamp": int(time.time()),
            "schedule_cron": schedule.get("cron"),
            "event": "drift.detected",
        }
        try:
            dispatch_event("drift.detected", payload)
        except Exception:
            logger.exception("Failed to send legacy drift alert for %s", stack)
    return {"status": status, "stack": stack, "diff": diff}


def discover_drift_schedules() -> list[dict[str, Any]]:
    """Return enabled schedules from stack_meta without filesystem enumeration."""
    from storage import pg

    rows = pg.query_all(
        "SELECT project_id, stack, data FROM stack_meta "
        "WHERE COALESCE(data->'drift_schedule'->>'enabled', 'false') = 'true'"
    )
    discovered: list[dict[str, Any]] = []
    for row in rows:
        data = row.get("data") if isinstance(row, dict) else None
        schedule = data.get("drift_schedule") if isinstance(data, dict) else None
        if not isinstance(schedule, dict) or not schedule.get("enabled"):
            continue
        discovered.append({
            "project_id": row.get("project_id"),
            "stack": row.get("stack"),
            "schedule": schedule,
        })
    return discovered


def reconcile_drift_jobs() -> None:
    """Make APScheduler jobs match enabled stack_meta drift schedules."""
    scheduler = _scheduler
    if scheduler is None:
        return
    desired: set[str] = set()
    for item in discover_drift_schedules():
        project_id = item.get("project_id")
        stack = item.get("stack")
        schedule = item.get("schedule") or {}
        cron = schedule.get("cron")
        if not stack or not isinstance(cron, str):
            continue
        if not _stack_dir(project_id, stack).is_dir():
            logger.warning("Skipping drift schedule for missing stack %s/%s", project_id, stack)
            continue
        job_id = _job_id(project_id, stack)
        try:
            trigger = CronTrigger.from_crontab(cron, timezone="UTC")
        except (ValueError, TypeError):
            logger.warning("Skipping invalid drift cron for %s/%s: %s", project_id, stack, cron)
            continue
        desired.add(job_id)
        try:
            scheduler.add_job(
                _scheduled_run,
                trigger=trigger,
                id=job_id,
                args=[project_id, stack],
                replace_existing=True,
                coalesce=True,
                max_instances=1,
            )
        except Exception:
            logger.exception("Failed to register drift schedule for %s/%s", project_id, stack)
    for job in scheduler.get_jobs():
        if job.id.startswith(_JOB_PREFIX) and job.id != _RECONCILE_JOB_ID and job.id not in desired:
            try:
                scheduler.remove_job(job.id)
            except Exception:
                logger.exception("Failed to remove stale drift job %s", job.id)


def _scheduler_task() -> None:
    try:
        reconcile_drift_jobs()
    except Exception:
        logger.exception("Drift scheduler reconciliation failed")


def complete_scheduled_drift(
    execution: Dict[str, Any],
    status: str,
    return_code: Any,
    finished_at: Any = None,
) -> None:
    """Persist scheduled completion and alert only when drift is confirmed."""
    run_params = execution.get("runParams") or {}
    if (
        run_params.get("execution_type") != "TOFU_RUN"
        or run_params.get("tofu_action") != "drift"
        or run_params.get("scheduled_drift") is not True
    ):
        return
    project_id = execution.get("projectId")
    stack = run_params.get("stack_name")
    if not stack:
        return
    try:
        code = int(return_code) if return_code is not None else None
    except (TypeError, ValueError):
        code = None
    if code == 2 and status == "SUCCESS":
        derived_status = "drifted"
    elif code == 0 and status == "SUCCESS":
        derived_status = "in_sync"
    else:
        derived_status = "error"
    meta = _load_meta(project_id, stack)
    drift_record = dict(meta.get("drift") or {})
    drift_record.update({
        "last_scheduled_check": int(finished_at or time.time()),
        "last_scheduled_run_id": execution.get("id") or execution.get("run_id"),
        "last_scheduled_returncode": code,
        "last_scheduled_status": derived_status,
    })
    _save_meta(project_id, stack, drift=drift_record)
    schedule = get_drift_schedule(project_id, stack)
    if derived_status == "drifted" and schedule.get("alert_on_drift", True):
        payload = {
            "project_id": project_id,
            "stack": stack,
            "status": derived_status,
            "returncode": code,
            "execution_id": execution.get("id") or execution.get("run_id"),
            "timestamp": int(finished_at or time.time()),
            "schedule_cron": schedule.get("cron"),
            "event": "stack.drifted",
        }
        try:
            dispatch_event("stack.drifted", payload)
        except Exception:
            logger.exception("Failed to send scheduled drift alert for %s", stack)


def start_drift_scheduler() -> None:
    global _scheduler
    with _scheduler_lock:
        if _scheduler is not None:
            return
        _scheduler = BackgroundScheduler(timezone="UTC")
        _scheduler.add_job(_scheduler_task, "interval", minutes=1, id=_RECONCILE_JOB_ID, replace_existing=True)
        _scheduler.start()
        reconcile_drift_jobs()
        logger.info("Drift scheduler started")


def stop_drift_scheduler() -> None:
    global _scheduler
    with _scheduler_lock:
        if _scheduler:
            _scheduler.shutdown()
            _scheduler = None
            logger.info("Drift scheduler stopped")
