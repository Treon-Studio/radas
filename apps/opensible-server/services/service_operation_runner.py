"""Worker-backed execution for project service operations.

Service operations use the existing worker claim/heartbeat protocol.  This
module owns only the service-operation payload and lifecycle bookkeeping; it
does not create another queue.  Provider calls remain behind the runtime
registry and every value crossing this boundary is redacted.
"""
from __future__ import annotations

import json
import os
import time
from collections.abc import Mapping
from typing import Any

from psycopg.types.json import Jsonb

from storage import pg
from services import runtime_registry, service_instances, service_operations
from services.runtime_provider import ProviderResult, redact

_DEFAULT_LEASE_SECONDS = 90.0


def _internal() -> service_instances.TrustedInternalExecution:
    return service_instances.internal_execution_context()


def _safe(value: Any) -> Any:
    return redact(value)


def _event_tx(conn: Any, operation_id: str, event: str, *, message: str | None = None,
              details: Mapping[str, Any] | None = None) -> None:
    conn.execute(
        "INSERT INTO service_operation_events(operation_id,event,message,details,created_at) "
        "VALUES (%s,%s,%s,%s,%s)",
        (operation_id, event, _safe(message) if message is not None else None,
         Jsonb(_safe(dict(details or {}))), time.time()),
    )


def append_event(operation_id: str, event: str, *, message: str | None = None,
                 details: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Append a redacted progress event; safe for worker retries."""
    with pg.transaction() as conn:
        _event_tx(conn, operation_id, event, message=message, details=details)
        row = conn.execute(
            "SELECT operation_id,event,message,details,created_at FROM service_operation_events "
            "WHERE operation_id = %s ORDER BY created_at DESC LIMIT 1", (operation_id,)
        ).fetchone()
    return dict(row) if row else {}


def list_events(operation_id: str, limit: int = 100) -> list[dict[str, Any]]:
    limit = max(1, min(int(limit), 500))
    rows = pg.query_all(
        "SELECT operation_id,event,message,details,created_at FROM service_operation_events "
        "WHERE operation_id = %s ORDER BY created_at ASC LIMIT %s", (operation_id, limit)
    )
    return [_safe(dict(row)) for row in rows]


def _payload(conn: Any, operation: Mapping[str, Any]) -> dict[str, Any] | None:
    instance_id = operation.get("instance_id")
    if not instance_id:
        return None
    instance = conn.execute(
        "SELECT id,org_id,project_id,name,definition_slug,definition_version,environment,"
        "runtime_id,status,desired_revision_id,provider_ref,endpoint_summary "
        "FROM service_instances WHERE id = %s", (instance_id,)
    ).fetchone()
    if not instance:
        return None
    revision_id = operation.get("payload", {}).get("desired_revision_id") if isinstance(operation.get("payload"), Mapping) else None
    revision_id = revision_id or instance.get("desired_revision_id")
    revision = conn.execute(
        "SELECT id,revision_number,redacted_spec FROM service_revisions WHERE id = %s AND instance_id = %s",
        (revision_id, instance_id),
    ).fetchone() if revision_id else None
    spec = dict((revision or {}).get("redacted_spec") or {})
    kind = str(operation.get("kind") or "")
    provider_operation = kind.removeprefix("service.")
    return {
        "operation_id": str(operation["id"]),
        "operation": provider_operation,
        "kind": kind,
        "idempotency_key": str(operation.get("idempotency_key") or ""),
        "org_id": str(operation["org_id"]),
        "project_id": str(operation["project_id"]),
        "instance_id": str(instance["id"]),
        "runtime_id": str(instance["runtime_id"]),
        "environment": str(instance["environment"]),
        "desired_revision_id": str(revision["id"]) if revision else None,
        "desired_revision_number": revision.get("revision_number") if revision else None,
        "spec": _safe(spec),
        "instance": _safe(dict(instance)),
    }


def _reclaim_expired(conn: Any, *, project_id: str | None = None) -> int:
    clauses = ["status = 'running'", "lease_until IS NOT NULL", "lease_until < %s"]
    params: list[Any] = [time.time()]
    if project_id:
        clauses.append("project_id = %s")
        params.append(project_id)
    rows = conn.execute(
        f"SELECT id FROM service_operations WHERE {' AND '.join(clauses)} FOR UPDATE SKIP LOCKED",
        tuple(params),
    ).fetchall()
    for row in rows:
        conn.execute(
            "UPDATE service_operations SET status='queued', worker_id=NULL, lease_until=NULL, heartbeat_at=NULL "
            "WHERE id=%s AND status='running'",
            (row["id"],),
        )
        _event_tx(conn, row["id"], "reclaimed", message="worker lease expired")
    return len(rows)


def reclaim_expired(*, project_id: str | None = None) -> int:
    with pg.transaction() as conn:
        return _reclaim_expired(conn, project_id=project_id)


def claim_next_operation(worker_id: str, *, project_id: str | None = None,
                         lease_seconds: float = _DEFAULT_LEASE_SECONDS) -> dict[str, Any] | None:
    """Claim exactly one queued service operation with a database CAS lock."""
    worker_id = str(worker_id or "").strip()
    if not worker_id:
        return None
    lease_seconds = max(10.0, min(float(lease_seconds), 3600.0))
    with pg.transaction() as conn:
        _reclaim_expired(conn, project_id=project_id)
        clauses = ["status = 'queued'"]
        params: list[Any] = []
        if project_id:
            clauses.append("project_id = %s")
            params.append(project_id)
        row = conn.execute(
            f"SELECT * FROM service_operations WHERE {' AND '.join(clauses)} "
            "ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1", tuple(params)
        ).fetchone()
        if not row:
            return None
        now = time.time()
        updated = conn.execute(
            "UPDATE service_operations SET status='running', worker_id=%s, heartbeat_at=%s, "
            "lease_until=%s, attempt=COALESCE(attempt,0)+1, started_at=COALESCE(started_at,%s) "
            "WHERE id=%s AND status='queued' RETURNING *",
            (worker_id, now, now + lease_seconds, now, row["id"]),
        ).fetchone()
        if not updated:
            return None
        payload = _payload(conn, updated)
        if payload is None:
            conn.execute(
                "UPDATE service_operations SET status='failed', error_code='OPERATION_FAILED', "
                "error_message='service instance or desired revision is unavailable', finished_at=%s "
                "WHERE id=%s AND status='running'", (now, updated["id"])
            )
            _event_tx(conn, updated["id"], "failed", message="service instance or desired revision is unavailable")
            return None
        _event_tx(conn, updated["id"], "running", details={"worker_id": worker_id, "attempt": updated.get("attempt", 1)})
        return payload


def heartbeat(operation_id: str, worker_id: str, *, lease_seconds: float = _DEFAULT_LEASE_SECONDS) -> bool:
    now = time.time()
    result = pg.query_one(
        "UPDATE service_operations SET heartbeat_at=%s, lease_until=%s "
        "WHERE id=%s AND status='running' AND worker_id=%s RETURNING id",
        (now, now + max(10.0, float(lease_seconds)), operation_id, worker_id),
    )
    return bool(result)


def _instance_success_status(kind: str, current: str) -> tuple[str, ...]:
    if kind in {"deploy", "update"}:
        if kind == "deploy" and current == "draft":
            return ("provisioning", "running")
        if kind == "update" and current in {"running", "degraded", "stopped"}:
            return ("updating", "running")
        return ("running",) if current != "running" else ("running",)
    if kind == "start":
        return ("running",)
    if kind == "stop":
        return ("stopped",)
    if kind == "destroy":
        return ("destroying", "destroyed")
    return (current,)


def _result_metadata(result: Mapping[str, Any]) -> tuple[Any, Any]:
    data = result.get("data") if isinstance(result, Mapping) else {}
    if not isinstance(data, Mapping):
        data = {}
    provider_ref = data.get("provider_ref") or data.get("providerRef") or data.get("instance")
    endpoint = data.get("endpoint") or data.get("endpoint_summary") or data.get("endpointSummary")
    return _safe(provider_ref), _safe(endpoint)


def finish_operation(operation_id: str, worker_id: str, *, success: bool,
                     result: Mapping[str, Any] | None = None, error_code: str | None = None,
                     error_message: str | None = None) -> dict[str, Any] | None:
    """Finish a claim idempotently and update observed instance state safely."""
    context = _internal()
    with pg.transaction() as conn:
        row = conn.execute("SELECT * FROM service_operations WHERE id=%s FOR UPDATE", (operation_id,)).fetchone()
        if not row:
            return None
        current = str(row["status"])
        if current in {"succeeded", "failed", "canceled"}:
            return dict(row)
        if current != "running" or str(row.get("worker_id") or "") != str(worker_id):
            return dict(row)
        kind = str(row.get("kind") or "").removeprefix("service.")
        safe_result = _safe(dict(result or {}))
        provider_ref, endpoint = _result_metadata(safe_result)
        # Clear the lease first; the operation CAS below remains authoritative.
        if success:
            instance = conn.execute("SELECT * FROM service_instances WHERE id=%s FOR UPDATE", (row.get("instance_id"),)).fetchone()
            if not instance:
                success = False
                error_code = "OPERATION_FAILED"
                error_message = "service instance is unavailable"
            else:
                # Apply the same conservative transition graph in this
                # transaction. The operation row and instance row are locked
                # together, so a late worker cannot overwrite a newer desired
                # or observed state.
                current_instance_status = str(instance["status"])
                for next_status in _instance_success_status(kind, current_instance_status):
                    if next_status == current_instance_status:
                        continue
                    if next_status not in service_instances.INSTANCE_TRANSITIONS.get(current_instance_status, frozenset()):
                        success = False
                        error_code = "OPERATION_FAILED"
                        error_message = "service instance state changed during operation"
                        break
                    changed = conn.execute(
                        "UPDATE service_instances SET status=%s, provider_ref=COALESCE(%s,provider_ref), "
                        "endpoint_summary=COALESCE(%s,endpoint_summary), updated_at=%s "
                        "WHERE id=%s AND status=%s RETURNING *",
                        (next_status, Jsonb(provider_ref) if provider_ref is not None else None,
                         Jsonb(endpoint) if endpoint is not None else None, time.time(),
                         instance["id"], current_instance_status),
                    ).fetchone()
                    if not changed:
                        success = False
                        error_code = "OPERATION_FAILED"
                        error_message = "service instance state changed during operation"
                        break
                    instance = changed
                    current_instance_status = next_status
        if not success and instance is not None:
            current_instance_status = str(instance["status"])
            if "failed" in service_instances.INSTANCE_TRANSITIONS.get(current_instance_status, frozenset()) and current_instance_status != "failed":
                changed = conn.execute(
                    "UPDATE service_instances SET status='failed', updated_at=%s WHERE id=%s AND status=%s RETURNING *",
                    (time.time(), instance["id"], current_instance_status),
                ).fetchone()
                if changed:
                    service_instances._audit_instance(
                        conn, "service.instance.transitioned", actor_id=None, row=changed,
                        before=current_instance_status, after="failed",
                        metadata={"operation_id": operation_id, "error_code": error_code},
                    )
                    instance = changed
        final_status = "succeeded" if success else "failed"
        safe_code = error_code if not success else None
        safe_message = error_message if not success else None
        # A second worker can never overwrite this row: worker ownership and
        # running status are part of the compare-and-set predicate.
        updated = conn.execute(
            "UPDATE service_operations SET status=%s,error_code=%s,error_message=%s,finished_at=%s,"
            "worker_id=NULL,lease_until=NULL,heartbeat_at=NULL WHERE id=%s AND status='running' AND worker_id=%s RETURNING *",
            (final_status, safe_code, _safe(safe_message) if safe_message else None, time.time(), operation_id, worker_id),
        ).fetchone()
        if not updated:
            return dict(row)
        _event_tx(conn, operation_id, final_status, details={"result": safe_result} if success else {"error_code": safe_code})
    return service_operations.get_operation(str(row["project_id"]), operation_id, internal_context=context)


def cancel_operation(project_id: str, operation_id: str, *, actor_id: str | None = None) -> dict[str, Any]:
    """Cancel queued/running work using the canonical operation CAS path."""
    result = service_operations.transition_operation(
        project_id, operation_id, "canceled", expected_status=None,
        actor_id=actor_id, internal_context=None if actor_id else _internal(),
    )
    with pg.transaction() as conn:
        conn.execute(
            "UPDATE service_operations SET worker_id=NULL,lease_until=NULL,heartbeat_at=NULL "
            "WHERE id=%s", (operation_id,)
        )
        _event_tx(conn, operation_id, "canceled", message="operation canceled")
    return result


def execute_claimed(operation_id: str, worker_id: str, *, registry: runtime_registry.RuntimeProviderRegistry | None = None) -> dict[str, Any] | None:
    """Invoke the registered provider for a worker-owned claim."""
    context = _internal()
    row = pg.query_one("SELECT * FROM service_operations WHERE id=%s", (operation_id,))
    if not row or row.get("status") != "running" or str(row.get("worker_id") or "") != str(worker_id):
        return row
    with pg.transaction() as conn:
        payload = _payload(conn, row)
    if not payload:
        return finish_operation(operation_id, worker_id, success=False, error_code="OPERATION_FAILED", error_message="operation payload unavailable")
    append_event(operation_id, "provider_step", message=f"invoking {payload['operation']}", details={"runtime_id": payload["runtime_id"]})
    if registry is None:
        registry = runtime_registry.build_default_registry()
    operation_name = payload["operation"]
    if operation_name in {"deploy", "update"}:
        args = (operation_id, payload["spec"])
    else:
        args = (operation_id, payload["instance"])
    result = registry.invoke(
        payload["runtime_id"], operation_name, *args,
        idempotency_key=payload["idempotency_key"],
    )
    if not isinstance(result, ProviderResult):
        return finish_operation(operation_id, worker_id, success=False, error_code="PROVIDER_ERROR", error_message="invalid provider result")
    if result.success:
        append_event(operation_id, "health_check", message="provider reported success")
        return finish_operation(operation_id, worker_id, success=True, result=result.to_dict())
    error = result.error or {}
    return finish_operation(
        operation_id, worker_id, success=False,
        error_code=str(error.get("code") or "PROVIDER_ERROR"),
        error_message=str(error.get("message") or "runtime provider operation failed"),
        result=result.to_dict(),
    )
