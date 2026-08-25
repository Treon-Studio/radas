"""Project-scoped service health, timeline, and bounded log projections."""
from __future__ import annotations

import base64
import time
import uuid
from collections.abc import Mapping
from typing import Any

from psycopg.types.json import Jsonb

from api.platform_contracts import redact_sensitive
from storage import pg


class ObservabilityError(ValueError):
    pass


def _instance(project_id: str, instance_id: str, actor_id: str | None) -> dict[str, Any]:
    row = pg.query_one("SELECT * FROM service_instances WHERE id=%s AND project_id=%s", (instance_id, project_id))
    if not row:
        raise ObservabilityError("service instance not found")
    member = pg.query_one("SELECT 1 FROM org_members WHERE org_id=%s AND user_id=%s", (row["org_id"], actor_id)) if actor_id else None
    if not member:
        raise ObservabilityError("project access denied")
    return row


def observe_health(project_id: str, instance_id: str, actor_id: str | None, status: str, details: Mapping[str, Any] | None = None) -> dict[str, Any]:
    instance = _instance(project_id, instance_id, actor_id)
    status = str(status or "unknown").lower()
    if status not in {"healthy", "degraded", "unhealthy", "unknown"}:
        raise ObservabilityError("invalid health status")
    safe_details = redact_sensitive(dict(details or {}))
    now = time.time()
    row = pg.query_one(
        "INSERT INTO service_health_observations (id,org_id,project_id,instance_id,check_name,status,details,endpoint,observed_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
        (str(uuid.uuid4()), instance["org_id"], project_id, instance_id, "service", status, Jsonb(safe_details), Jsonb(redact_sensitive(instance.get("endpoint_summary"))) if instance.get("endpoint_summary") else None, now),
    )
    return dict(row)


def health(project_id: str, instance_id: str, actor_id: str | None) -> dict[str, Any]:
    instance = _instance(project_id, instance_id, actor_id)
    latest = pg.query_one("SELECT * FROM service_health_observations WHERE instance_id=%s ORDER BY observed_at DESC LIMIT 1", (instance_id,))
    return {"current": dict(latest) if latest else {"status": "unknown", "observed_at": None}, "endpoint": redact_sensitive(instance.get("endpoint_summary")), "provider_ref": redact_sensitive(instance.get("provider_ref"))}


def timeline(project_id: str, instance_id: str, actor_id: str, limit: int = 50) -> list[dict[str, Any]]:
    _instance(project_id, instance_id, actor_id)
    limit = max(1, min(int(limit or 50), 200))
    rows = pg.query_all("SELECT id,kind,status,error_code,error_message,created_at,started_at,finished_at FROM service_operations WHERE project_id=%s AND instance_id=%s ORDER BY created_at DESC LIMIT %s", (project_id, instance_id, limit))
    return [redact_sensitive(dict(row)) for row in rows]


def logs(project_id: str, instance_id: str, actor_id: str, limit: int = 50, cursor: str | None = None) -> dict[str, Any]:
    _instance(project_id, instance_id, actor_id)
    limit = max(1, min(int(limit or 50), 200))
    params: list[Any] = [instance_id, limit]
    clause = ""
    if cursor:
        try:
            created = float(base64.urlsafe_b64decode(cursor.encode()).decode())
            clause = " AND created_at < %s"
            params.insert(1, created)
        except Exception as exc:
            raise ObservabilityError("invalid cursor") from exc
    rows = pg.query_all(f"SELECT id,event,message,details,created_at FROM service_operation_events WHERE operation_id IN (SELECT id FROM service_operations WHERE instance_id=%s){clause} ORDER BY created_at DESC LIMIT %s", tuple(params))
    items = [redact_sensitive(dict(row)) for row in rows]
    next_cursor = base64.urlsafe_b64encode(str(rows[-1]["created_at"]).encode()).decode() if len(rows) == limit else None
    return {"items": items, "next_cursor": next_cursor}
