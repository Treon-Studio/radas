"""Worker-backed execution for project service operations.

Service operations use the existing worker claim/heartbeat protocol.  This
module owns only the service-operation payload and lifecycle bookkeeping; it
does not create another queue.  Provider calls remain behind the runtime
registry and every value crossing this boundary is redacted.
"""
from __future__ import annotations

import json
import os
import re
import time
import uuid
from collections.abc import Mapping
from typing import Any

from psycopg.types.json import Jsonb

from storage import pg
from services import runtime_registry, service_instances, service_operations
from services.runtime_provider import ProviderResult, redact

_DEFAULT_LEASE_SECONDS = 90.0
_EVENT_REDACTED = "[REDACTED]"
_EVENT_SENSITIVE_KEY = re.compile(
    r"(?:api[_ -]?key|access[_ -]?key|access[_ -]?token|refresh[_ -]?token|"
    r"client[_ -]?secret|client[_ -]?token|password|secret|credential|token|"
    r"private[_ -]?key|authorization|bearer)",
    re.IGNORECASE,
)


def _safe_event_value(value: Any, *, key: str = "") -> Any:
    """Redact event data and normalize worker-controlled error codes.

    Event details are persisted as JSON and can contain arbitrary nested
    provider data, so redact credential-bearing keys before traversing values.
    String values still pass through the shared natural-language sanitizer.
    """
    normalized_key = key.lower().replace("-", "_")
    if normalized_key in {"error_code", "errorcode"}:
        return service_operations._safe_error_code(value)
    if key and _EVENT_SENSITIVE_KEY.search(key):
        return _EVENT_REDACTED
    if isinstance(value, Mapping):
        return {
            str(child_key): _safe_event_value(child, key=str(child_key))
            for child_key, child in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_safe_event_value(child) for child in value]
    return _safe(value)


def _safe_error_code(value: Any) -> str | None:
    return service_operations._safe_error_code(value)


def _internal() -> service_instances.TrustedInternalExecution:
    return service_instances.internal_execution_context()


def _safe(value: Any) -> Any:
    return redact(value)


def _event_tx(conn: Any, operation_id: str, event: str, *, message: str | None = None,
              details: Mapping[str, Any] | None = None) -> None:
    values = (
        operation_id, event, _safe(message) if message is not None else None,
        Jsonb(_safe_event_value(dict(details or {}))), time.time(),
    )
    if event in {"queued", "succeeded", "failed", "canceled"}:
        conn.execute(
            "INSERT INTO service_operation_events(operation_id,event,message,details,created_at) "
            "VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
            values,
        )
        return
    conn.execute(
        "INSERT INTO service_operation_events(operation_id,event,message,details,created_at) "
        "VALUES (%s,%s,%s,%s,%s)", values,
    )


def append_event(operation_id: str, event: str, *, message: str | None = None,
                 details: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Append an internal redacted progress event."""
    with pg.transaction() as conn:
        _event_tx(conn, operation_id, event, message=message, details=details)
        row = conn.execute(
            "SELECT operation_id,event,message,details,created_at FROM service_operation_events "
            "WHERE operation_id = %s ORDER BY created_at DESC LIMIT 1", (operation_id,)
        ).fetchone()
    return dict(row) if row else {}


def append_worker_event(operation_id: str, worker_id: str, lease_token: str, event: str,
                        *, message: str | None = None,
                        details: Mapping[str, Any] | None = None) -> dict[str, Any] | None:
    """Append an event only while the exact worker lease is live."""
    token = str(lease_token or "").strip()
    if not token:
        return None
    now = time.time()
    with pg.transaction() as conn:
        owner = conn.execute(
            "SELECT id FROM service_operations WHERE id=%s AND status='running' "
            "AND worker_id=%s AND lease_token=%s AND lease_until >= %s FOR UPDATE",
            (operation_id, worker_id, token, now),
        ).fetchone()
        if not owner:
            return None
        _event_tx(conn, operation_id, event, message=message, details=details)
        row = conn.execute(
            "SELECT operation_id,event,message,details,created_at FROM service_operation_events "
            "WHERE operation_id=%s ORDER BY created_at DESC LIMIT 1", (operation_id,),
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
    # ``redacted_spec`` is safe for persistence and deliberately retains
    # validated secret_ref metadata for provider lookup. Do not pass it through
    # the generic provider redactor again: that redactor treats the
    # ``secret_ref`` field name as sensitive and would erase the reference.
    spec = service_instances.redact_spec((revision or {}).get("redacted_spec") or {})
    kind = str(operation.get("kind") or "")
    provider_operation = kind.removeprefix("service.")
    return {
        "operation_id": str(operation["id"]),
        "lease_token": str(operation.get("lease_token") or ""),
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
        # ``spec`` has already passed the service-instance sanitizer. Keep
        # validated secret_ref metadata intact while ensuring values were
        # replaced with redaction markers before the worker boundary.
        "spec": spec,
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
            "UPDATE service_operations SET status='queued', worker_id=NULL, lease_token=NULL, lease_until=NULL, heartbeat_at=NULL "
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
        lease_token = str(uuid.uuid4())
        updated = conn.execute(
            "UPDATE service_operations SET status='running', worker_id=%s, lease_token=%s, heartbeat_at=%s, "
            "lease_until=%s, attempt=COALESCE(attempt,0)+1, started_at=COALESCE(started_at,%s) "
            "WHERE id=%s AND status='queued' RETURNING *",
            (worker_id, lease_token, now, now + lease_seconds, now, row["id"]),
        ).fetchone()
        if not updated:
            return None
        payload = _payload(conn, updated)
        if payload is None:
            conn.execute(
                "UPDATE service_operations SET status='failed', error_code='OPERATION_FAILED', "
                "error_message='service instance or desired revision is unavailable', finished_at=%s, "
                "worker_id=NULL, lease_token=NULL, lease_until=NULL, heartbeat_at=NULL "
                "WHERE id=%s AND status='running' AND worker_id=%s AND lease_token=%s",
                (now, updated["id"], worker_id, lease_token),
            )
            _event_tx(conn, updated["id"], "failed", message="service instance or desired revision is unavailable")
            return None
        _event_tx(conn, updated["id"], "running", details={"worker_id": worker_id, "attempt": updated.get("attempt", 1)})
        return payload


def heartbeat(operation_id: str, worker_id: str, *, lease_token: str,
              lease_seconds: float = _DEFAULT_LEASE_SECONDS) -> bool:
    token = str(lease_token or "").strip()
    if not token:
        return False
    now = time.time()
    result = pg.query_one(
        "UPDATE service_operations SET heartbeat_at=%s, lease_until=%s WHERE "
        "id=%s AND status='running' AND worker_id=%s AND lease_token=%s AND lease_until >= %s RETURNING id",
        (now, now + max(10.0, float(lease_seconds)), operation_id, worker_id, token, now),
    )
    return bool(result)


def _instance_success_status(kind: str, current: str) -> tuple[str, ...]:
    """Return the observed-state path for a successful provider operation.

    A retry is allowed to re-enter provisioning/updating from a failed or
    stopped instance, while a fresh deploy from draft still follows the normal
    provisioning path.  Every intermediate state is checked against the
    canonical transition graph by ``finish_operation``.
    """
    if kind == "deploy":
        if current in {"draft", "failed", "stopped"}:
            return ("provisioning", "running")
        if current in {"provisioning", "updating"}:
            return ("running",)
        return ("running",)
    if kind == "rollback":
        if current in {"failed", "stopped", "draft"}:
            return ("updating", "running")
        return ("updating", "running")
    if kind == "update":
        if current in {"failed", "stopped", "draft"}:
            return ("updating", "running")
        if current == "updating":
            return ("running",)
        return ("running",)
    if kind in {"start", "restart"}:
        if current in {"draft", "failed", "stopped", "degraded"}:
            return ("running",)
        return ("running",)
    if kind == "stop":
        return ("stopped",)
    if kind == "destroy":
        if current in {"draft", "failed", "stopped", "running", "degraded"}:
            return ("destroying", "destroyed")
        if current == "destroying":
            return ("destroyed",)
        return ("destroyed",)
    return (current,)


def _result_metadata(result: Mapping[str, Any]) -> tuple[Any, Any]:
    data = result.get("data") if isinstance(result, Mapping) else {}
    if not isinstance(data, Mapping):
        data = {}
    provider_ref = data.get("provider_ref") or data.get("providerRef") or data.get("instance")
    endpoint = data.get("endpoint") or data.get("endpoint_summary") or data.get("endpointSummary")
    return _safe(provider_ref), _safe(endpoint)


def _finish_return(row: Mapping[str, Any] | None, applied: bool, with_outcome: bool) -> Any:
    result = dict(row) if row is not None else None
    return (result, applied) if with_outcome else result


def finish_operation(operation_id: str, worker_id: str, *, success: bool,
                     result: Mapping[str, Any] | None = None, error_code: str | None = None,
                     error_message: str | None = None, canceled: bool = False,
                     lease_token: str | None = None, _with_outcome: bool = False) -> Any:
    """Finish a claim idempotently and update observed instance state safely.

    ``_with_outcome`` is used by the worker route to distinguish an applied
    finish from a stale/no-op result without exposing that implementation
    detail in the normal operation response.
    """
    context = _internal()
    with pg.transaction() as conn:
        row = conn.execute("SELECT * FROM service_operations WHERE id=%s FOR UPDATE", (operation_id,)).fetchone()
        if not row:
            return _finish_return(None, False, _with_outcome)
        current = str(row["status"])
        if current in {"succeeded", "failed", "canceled"}:
            return _finish_return(row, False, _with_outcome)
        supplied_token = str(lease_token or "").strip()
        if current != "running" or str(row.get("worker_id") or "") != str(worker_id):
            return _finish_return(row, False, _with_outcome)
        if not supplied_token or str(row.get("lease_token") or "") != supplied_token:
            return _finish_return(row, False, _with_outcome)
        if row.get("lease_until") is None or float(row["lease_until"]) < time.time():
            return _finish_return(row, False, _with_outcome)
        if canceled:
            success = False
            error_code = "OPERATION_CANCELED"
            error_message = "service operation was canceled"
        kind = str(row.get("kind") or "").removeprefix("service.")
        safe_result = _safe(dict(result or {}))
        provider_ref, endpoint = _result_metadata(safe_result)
        # Always initialize the instance before any provider/validation path.
        # Failure handling must never raise UnboundLocalError and must retain
        # the immutable desired revision on the instance.
        instance = None
        if row.get("instance_id"):
            instance = conn.execute(
                "SELECT * FROM service_instances WHERE id=%s FOR UPDATE",
                (row.get("instance_id"),),
            ).fetchone()
        # Cancellation wins over a late provider result.  The terminal row is
        # immutable and no observed provider state is applied after cancel.
        if current == "canceled":
            return _finish_return(row, False, _with_outcome)
        # All instance mutations are protected by a savepoint. If the final
        # lease CAS loses a race with expiry/reclaim, rolling back this
        # savepoint prevents a stale worker from committing observed state.
        conn.execute("SAVEPOINT finish_instance")
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
        if not success and not canceled and instance is not None:
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
        final_status = "canceled" if canceled else ("succeeded" if success else "failed")
        safe_code = (_safe_error_code(error_code) or "OPERATION_FAILED") if final_status != "succeeded" else None
        safe_message = service_operations._safe_error_message(error_message) if final_status != "succeeded" else None
        # A second worker can never overwrite this row: worker ownership and
        # running status are part of the compare-and-set predicate.
        updated = conn.execute(
            "UPDATE service_operations SET status=%s,error_code=%s,error_message=%s,finished_at=%s,"
            "provider_result=%s,worker_id=NULL,lease_token=NULL,lease_until=NULL,heartbeat_at=NULL "
            "WHERE id=%s AND status='running' AND worker_id=%s "
            "AND lease_token=%s AND lease_until >= %s RETURNING *",
            (final_status, safe_code, _safe(safe_message) if safe_message else None, time.time(),
             Jsonb(safe_result), operation_id, worker_id, supplied_token, time.time()),
        ).fetchone()
        if not updated:
            conn.execute("ROLLBACK TO SAVEPOINT finish_instance")
            conn.execute("RELEASE SAVEPOINT finish_instance")
            latest = conn.execute("SELECT * FROM service_operations WHERE id=%s", (operation_id,)).fetchone()
            return _finish_return(latest or row, False, _with_outcome)
        conn.execute("RELEASE SAVEPOINT finish_instance")
        _event_tx(conn, operation_id, final_status, details={"result": safe_result} if success else {"error_code": safe_code})
    finished = service_operations.get_operation(str(row["project_id"]), operation_id, internal_context=context)
    return _finish_return(finished, True, _with_outcome)


def cancel_operation(project_id: str, operation_id: str, *, actor_id: str | None = None) -> dict[str, Any]:
    """Cancel queued/running work using one auditable, idempotent CAS path."""
    with pg.transaction() as conn:
        service_operations._project_access(
            conn, project_id, org_id=None, actor_id=actor_id,
            internal_context=None if actor_id else _internal(),
        )
        row = conn.execute(
            "SELECT * FROM service_operations WHERE id=%s AND project_id=%s FOR UPDATE",
            (operation_id, project_id),
        ).fetchone()
        if not row:
            raise service_operations.OperationNotFoundError("service operation not found")
        if str(row.get("status")) in {"succeeded", "failed", "canceled"}:
            return service_operations._row(row)
        now = time.time()
        updated = conn.execute(
            "UPDATE service_operations SET status='canceled',error_code='OPERATION_CANCELED',"
            "error_message='service operation was canceled',finished_at=%s,worker_id=NULL,"
            "lease_token=NULL,lease_until=NULL,heartbeat_at=NULL WHERE id=%s AND project_id=%s "
            "AND status IN ('pending','queued','running') RETURNING *",
            (now, operation_id, project_id),
        ).fetchone()
        if not updated:
            updated = conn.execute("SELECT * FROM service_operations WHERE id=%s", (operation_id,)).fetchone()
        _event_tx(conn, operation_id, "canceled", message="operation canceled")
        service_operations._audit_lifecycle(
            conn, "service.operation.canceled", actor_id=actor_id,
            org_id=updated.get("org_id"), project_id=project_id,
            instance_id=updated.get("instance_id"), operation=updated,
            before=row.get("status"), after="canceled",
        )
    return service_operations._row(updated)


def execute_claimed(operation_id: str, worker_id: str, *, registry: runtime_registry.RuntimeProviderRegistry | None = None) -> dict[str, Any] | None:
    """Invoke a provider for a live claim and fail safely on every boundary."""
    row = pg.query_one("SELECT * FROM service_operations WHERE id=%s", (operation_id,))
    if not row or row.get("status") != "running" or str(row.get("worker_id") or "") != str(worker_id):
        return row
    lease_token = str(row.get("lease_token") or "") or None
    try:
        with pg.transaction() as conn:
            payload = _payload(conn, row)
        if not payload:
            return finish_operation(operation_id, worker_id, success=False,
                                    error_code="OPERATION_FAILED",
                                    error_message="operation payload unavailable",
                                    lease_token=lease_token)
        append_event(operation_id, "provider_step", message=f"invoking {payload['operation']}", details={"runtime_id": payload["runtime_id"]})
        if registry is None:
            registry = runtime_registry.build_default_registry()
        operation_name = payload["operation"]
        args = (operation_id, payload["spec"]) if operation_name in {"deploy", "update", "rollback"} else (operation_id, payload["instance"])
        result = registry.invoke(
            payload["runtime_id"], operation_name, *args,
            idempotency_key=payload["idempotency_key"],
        )
        if not isinstance(result, ProviderResult):
            return finish_operation(operation_id, worker_id, success=False,
                                    error_code="INVALID_PROVIDER_RESULT",
                                    error_message="invalid provider result",
                                    lease_token=lease_token)
        if result.success:
            append_event(operation_id, "health_check", message="provider reported success")
            return finish_operation(operation_id, worker_id, success=True,
                                    result=result.to_dict(), lease_token=lease_token)
        error = result.error or {}
        return finish_operation(
            operation_id, worker_id, success=False,
            error_code=str(error.get("code") or "PROVIDER_ERROR"),
            error_message=str(error.get("message") or "runtime provider operation failed"),
            result=result.to_dict(), lease_token=lease_token,
        )
    except BaseException as exc:
        # Provider adapters and event persistence are untrusted boundaries. Do
        # not expose exception text; finish through the same ownership CAS.
        try:
            return finish_operation(
                operation_id, worker_id, success=False,
                error_code="OPERATION_FAILED",
                error_message="service operation failed",
                lease_token=lease_token,
            )
        except Exception:
            return pg.query_one("SELECT * FROM service_operations WHERE id=%s", (operation_id,))
