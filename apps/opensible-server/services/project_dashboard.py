"""Read-only, project-scoped operational dashboard aggregation."""
from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from api.platform_contracts import redact_sensitive
from services import cloud_provisioning
from storage import pg

_MAX_ITEMS = 5
_HEALTH_STATUSES = ("healthy", "degraded", "unhealthy", "unknown")
_ATTENTION_PRIORITY = {"unhealthy": 0, "failed": 1, "drifted": 2, "degraded": 3}

_drift_status = cloud_provisioning._drift_status


def _project(project_id: str) -> dict[str, str]:
    row = pg.query_one(
        "SELECT id, name, COALESCE(description, '') AS description FROM projects WHERE id = %s",
        (project_id,),
    )
    if not row:
        raise ValueError("project not found")
    return {
        "id": str(row["id"]),
        "name": str(row["name"]),
        "description": str(row["description"]),
    }


def _service_health(project_id: str) -> tuple[dict[str, int], list[dict[str, Any]]]:
    rows = pg.query_all(
        "SELECT i.id, i.name, i.environment, COALESCE(h.status, 'unknown') AS status, h.observed_at "
        "FROM service_instances i "
        "LEFT JOIN LATERAL ("
        "  SELECT status, observed_at FROM service_health_observations "
        "  WHERE instance_id = i.id AND project_id = %s "
        "  ORDER BY observed_at DESC, id DESC LIMIT 1"
        ") h ON TRUE "
        "WHERE i.project_id = %s AND i.archived = FALSE "
        "ORDER BY h.observed_at DESC NULLS LAST, i.id DESC",
        (project_id, project_id),
    )
    counts = {status: 0 for status in _HEALTH_STATUSES}
    items: list[dict[str, Any]] = []
    for row in rows:
        status = str(row["status"])
        if status not in counts:
            status = "unknown"
        counts[status] += 1
        items.append(
            redact_sensitive(
                {
                    "instance_id": str(row["id"]),
                    "name": str(row["name"]),
                    "environment": str(row["environment"]),
                    "status": status,
                    "observed_at": row["observed_at"],
                }
            )
        )
    return counts, items


def _stack_summary(project_id: str) -> tuple[int, int, list[dict[str, Any]]]:
    rows = pg.query_all(
        "SELECT stack, data FROM stack_meta WHERE project_id = %s ORDER BY stack ASC",
        (project_id,),
    )
    drifted: list[dict[str, Any]] = []
    for row in rows:
        stack = str(row["stack"])
        data = row.get("data") if isinstance(row.get("data"), Mapping) else {}
        if data.get("drift_enabled") is not True:
            continue
        drift = _drift_status(project_id, stack)
        if drift.get("status") == "drifted":
            drifted.append(
                {
                    "name": stack,
                    "last_run_finished_at": drift.get("last_checked_at"),
                }
            )
    return len(rows), len(drifted), drifted


def _runs(project_id: str) -> tuple[dict[str, int], list[dict[str, Any]]]:
    directory = cloud_provisioning._project_executions_dir(project_id)
    items: list[dict[str, Any]] = []
    if directory.exists():
        files = sorted(directory.glob("*.json"), key=lambda path: path.name, reverse=True)
        for path in files[:200]:
            try:
                execution = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            params = execution.get("runParams") or {}
            if params.get("execution_type") != "TOFU_RUN":
                continue
            run = cloud_provisioning._exec_to_run(execution)
            if not run.get("run_id") or not run.get("stack"):
                continue
            items.append(
                redact_sensitive(
                    {
                        "id": str(run["run_id"]),
                        "stack": str(run["stack"]),
                        "action": str(run.get("action") or "unknown"),
                        "status": str(run.get("status") or "unknown"),
                        "started_at": run.get("started_at") or None,
                        "finished_at": run.get("finished_at") or None,
                    }
                )
            )

    items.sort(
        key=lambda item: (
            float(item.get("started_at") or item.get("finished_at") or 0),
            str(item["id"]),
        ),
        reverse=True,
    )
    return {
        "active": sum(item["status"] in {"queued", "running"} for item in items),
        "failed": sum(item["status"] == "failed" for item in items),
    }, items


def _attention(
    drifted_stacks: list[Mapping[str, Any]],
    runs: list[Mapping[str, Any]],
    services: list[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    candidates: list[tuple[int, float, str, dict[str, Any]]] = []
    for service in services:
        status = str(service["status"])
        if status not in {"unhealthy", "degraded"}:
            continue
        instance_id = str(service["instance_id"])
        candidates.append(
            (
                _ATTENTION_PRIORITY[status],
                float(service.get("observed_at") or 0),
                instance_id,
                {
                    "kind": "service_health",
                    "severity": "critical" if status == "unhealthy" else "warning",
                    "title": f"{service['name']} is {status}",
                    "occurred_at": service.get("observed_at"),
                    "target": {"type": "service", "id": instance_id},
                },
            )
        )
    for run in runs:
        if run["status"] != "failed":
            continue
        run_id = str(run["id"])
        occurred_at = run.get("finished_at") or run.get("started_at")
        candidates.append(
            (
                _ATTENTION_PRIORITY["failed"],
                float(occurred_at or 0),
                run_id,
                {
                    "kind": "run",
                    "severity": "critical",
                    "title": f"{run['stack']} {run['action']} failed",
                    "occurred_at": occurred_at,
                    "target": {"type": "run", "id": run_id},
                },
            )
        )
    for stack in drifted_stacks:
        stack_id = str(stack["name"])
        occurred_at = stack.get("last_run_finished_at") or stack.get("updated_at")
        candidates.append(
            (
                _ATTENTION_PRIORITY["drifted"],
                float(occurred_at or 0),
                stack_id,
                {
                    "kind": "drift",
                    "severity": "warning",
                    "title": f"{stack_id} has drift",
                    "occurred_at": occurred_at,
                    "target": {"type": "stack", "id": stack_id},
                },
            )
        )
    candidates.sort(key=lambda item: item[2], reverse=True)
    candidates.sort(key=lambda item: item[1], reverse=True)
    candidates.sort(key=lambda item: item[0])
    return [redact_sensitive(item[3]) for item in candidates[:_MAX_ITEMS]]


def build_dashboard(project_id: str) -> dict[str, Any]:
    """Build the bounded, safe dashboard view for one already-authorized project."""
    project = _project(project_id)
    stack_total, drifted_total, drifted_stacks = _stack_summary(project_id)
    run_counts, runs = _runs(project_id)
    health_counts, services = _service_health(project_id)
    attention = _attention(drifted_stacks, runs, services)

    return {
        "project": project,
        "summary": {
            "stacks": {"total": stack_total, "drifted": drifted_total},
            "runs": run_counts,
            "services": {"total": sum(health_counts.values()), **health_counts},
            "requires_attention": len(attention),
        },
        "attention": attention,
        "recent_runs": runs[:_MAX_ITEMS],
        "service_health": services[:_MAX_ITEMS],
    }
