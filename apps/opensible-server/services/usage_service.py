"""Normalized service usage snapshots and billing-ready projections."""
from __future__ import annotations

import time
import uuid
from collections.abc import Mapping
from typing import Any

from psycopg.types.json import Jsonb

from api.platform_contracts import redact_sensitive
from storage import pg


class UsageError(ValueError):
    pass


def _instance(project_id: str, instance_id: str, actor_id: str | None) -> dict[str, Any]:
    row = pg.query_one("SELECT * FROM service_instances WHERE id=%s AND project_id=%s", (instance_id, project_id))
    if not row:
        raise UsageError("service instance not found")
    member = pg.query_one("SELECT 1 FROM org_members WHERE org_id=%s AND user_id=%s", (row["org_id"], actor_id)) if actor_id else None
    if not member:
        raise UsageError("project access denied")
    return row


def record(project_id: str, instance_id: str, actor_id: str | None, data: Mapping[str, Any]) -> dict[str, Any]:
    instance = _instance(project_id, instance_id, actor_id)
    def integer(key: str) -> int:
        try: return max(0, int(data.get(key) or 0))
        except (TypeError, ValueError): raise UsageError(f"{key} must be an integer")
    try: seconds = max(0.0, float(data.get("running_seconds") or 0))
    except (TypeError, ValueError): raise UsageError("running_seconds must be numeric")
    row = pg.query_one(
        "INSERT INTO service_usage_snapshots (id,org_id,project_id,instance_id,runtime_id,cpu_millicores,memory_mb,storage_gb,running_seconds,provider_cost,observed_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
        (str(uuid.uuid4()), instance["org_id"], project_id, instance_id, instance["runtime_id"], integer("cpu_millicores"), integer("memory_mb"), integer("storage_gb"), seconds, Jsonb(redact_sensitive(dict(data.get("provider_cost") or {}))), time.time()),
    )
    return dict(row)


def project(project_id: str, actor_id: str | None) -> dict[str, Any]:
    row = pg.query_one("SELECT org_id FROM projects WHERE id=%s", (project_id,))
    if not row: raise UsageError("project not found")
    _instance_for_project_access(project_id, actor_id, row["org_id"])
    rows = pg.query_all("SELECT * FROM service_usage_snapshots WHERE project_id=%s ORDER BY observed_at DESC", (project_id,))
    return _summary(rows)


def organization(org_id: str, actor_id: str | None) -> dict[str, Any]:
    member = pg.query_one("SELECT 1 FROM org_members WHERE org_id=%s AND user_id=%s", (org_id, actor_id)) if actor_id else None
    if not member: raise UsageError("organization access denied")
    return _summary(pg.query_all("SELECT * FROM service_usage_snapshots WHERE org_id=%s ORDER BY observed_at DESC", (org_id,)))


def _instance_for_project_access(project_id: str, actor_id: str | None, org_id: str) -> None:
    member = pg.query_one("SELECT 1 FROM org_members WHERE org_id=%s AND user_id=%s", (org_id, actor_id)) if actor_id else None
    if not member: raise UsageError("project access denied")


def _summary(rows: list[Mapping[str, Any]]) -> dict[str, Any]:
    totals = {"cpu_millicores": 0, "memory_mb": 0, "storage_gb": 0, "running_seconds": 0.0}
    for row in rows:
        for key in totals: totals[key] += float(row.get(key) or 0)
    return {"totals": {**totals, "running_seconds": round(totals["running_seconds"], 3)}, "snapshots": [redact_sensitive(dict(row)) for row in rows], "count": len(rows)}


def export(project_id: str, actor_id: str | None) -> list[dict[str, Any]]:
    return project(project_id, actor_id)["snapshots"]


# ---------------------------------------------------------------------------
# UC550: Cost Anomaly Alert Threshold Configuration
# ---------------------------------------------------------------------------

def set_cost_anomaly_config(
    project_id: str,
    max_percentage_spike: int = 50,
    max_amount_delta: float = 100.0,
    alert_emails: list[str] | None = None,
) -> dict[str, Any]:
    """Configure cost anomaly detection thresholds for a project (UC550)."""
    pid = project_id or "default"
    config = {
        "project_id": pid,
        "max_percentage_spike": max(1, int(max_percentage_spike)),
        "max_amount_delta": max(0.0, float(max_amount_delta)),
        "alert_emails": list(alert_emails or []),
        "updated_at": int(time.time()),
    }
    try:
        from storage import kv
        kv.kv_save(f"cost_anomaly_config:{pid}", config)
    except Exception:
        pass
    return config


def get_cost_anomaly_config(project_id: str) -> dict[str, Any]:
    """Retrieve cost anomaly configuration for a project (UC550)."""
    pid = project_id or "default"
    try:
        from storage import kv
        val = kv.kv_load(f"cost_anomaly_config:{pid}")
        if isinstance(val, dict):
            return val
    except Exception:
        pass
    return {
        "project_id": pid,
        "max_percentage_spike": 50,
        "max_amount_delta": 100.0,
        "alert_emails": [],
    }


def detect_cost_anomaly(
    project_id: str,
    previous_cost: float,
    current_cost: float,
) -> dict[str, Any]:
    """Detect whether a cost change constitutes an abnormal spike (UC550)."""
    cfg = get_cost_anomaly_config(project_id)
    prev = max(0.0, float(previous_cost))
    curr = max(0.0, float(current_cost))

    delta_amount = curr - prev
    percentage_spike = 0.0
    if prev > 0:
        percentage_spike = (delta_amount / prev) * 100.0
    elif curr > 0:
        percentage_spike = 100.0

    is_anomaly = False
    reasons = []

    if delta_amount > cfg["max_amount_delta"]:
        is_anomaly = True
        reasons.append(f"Absolute delta ${delta_amount:.2f} exceeds threshold ${cfg['max_amount_delta']:.2f}")

    if prev > 0 and percentage_spike >= cfg["max_percentage_spike"]:
        is_anomaly = True
        reasons.append(f"Percentage spike {percentage_spike:.1f}% exceeds threshold {cfg['max_percentage_spike']}%")

    return {
        "project_id": project_id,
        "previous_cost": prev,
        "current_cost": curr,
        "delta_amount": round(delta_amount, 2),
        "percentage_spike": round(percentage_spike, 1),
        "is_anomaly": is_anomaly,
        "reasons": reasons,
        "thresholds": cfg,
    }

