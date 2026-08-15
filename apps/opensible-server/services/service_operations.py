"""Tenant-scoped, idempotent service operation persistence."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid
from typing import Any, Mapping

from psycopg import errors as psycopg_errors
from psycopg.types.json import Jsonb

from storage import pg
from services.runtime_provider import redact
from services.service_instances import (
    ProjectAuthorizationError,
    ProjectNotFoundError,
    TrustedInternalExecution,
    _authorize_project_access,
    _is_trusted_internal,
    _project_context,
    redact_spec,
)

OPERATION_STATES = frozenset({"pending", "queued", "running", "succeeded", "failed", "canceled"})
OPERATION_TRANSITIONS: dict[str, frozenset[str]] = {
    "pending": frozenset({"pending", "queued", "running", "failed", "canceled"}),
    "queued": frozenset({"queued", "running", "failed", "canceled"}),
    "running": frozenset({"running", "succeeded", "failed", "canceled"}),
    "succeeded": frozenset({"succeeded"}),
    "failed": frozenset({"failed"}),
    "canceled": frozenset({"canceled"}),
}


class ServiceOperationError(ValueError):
    pass


class OperationNotFoundError(LookupError):
    pass


class OperationConflictError(ServiceOperationError):
    pass


class InvalidOperationState(ServiceOperationError):
    pass


def _text(value: Any, field: str) -> str:
    value = str(value or "").strip()
    if not value:
        raise ServiceOperationError(f"{field} is required")
    return value


def _canonical_payload(payload: Any) -> Any:
    if payload is None:
        return {}
    if isinstance(payload, Mapping):
        return {str(key): _canonical_payload(value) for key, value in payload.items()}
    if isinstance(payload, (list, tuple)):
        return [_canonical_payload(item) for item in payload]
    if isinstance(payload, (str, int, float, bool)) or payload is None:
        return payload
    raise ServiceOperationError("payload must contain only JSON-compatible values")


def _fingerprint_key() -> bytes:
    configured = os.environ.get("IDEMPOTENCY_FINGERPRINT_SECRET") or os.environ.get("INTERNAL_CALL_SECRET")
    if not configured:
        raise ServiceOperationError(
            "idempotency fingerprinting is unavailable: configure "
            "IDEMPOTENCY_FINGERPRINT_SECRET or INTERNAL_CALL_SECRET"
        )
    return configured.encode("utf-8")


def payload_fingerprint(kind: str, payload: Any, *, instance_id: str | None = None) -> str:
    normalized = {
        "kind": _text(kind, "kind"),
        "instance_id": instance_id,
        "payload": _canonical_payload(payload),
    }
    encoded = json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hmac.new(_fingerprint_key(), encoded, hashlib.sha256).hexdigest()


def _project_access(conn: Any, project_id: str, org_id: str | None, actor_id: str | None,
                    internal_context: TrustedInternalExecution | None = None) -> str:
    return _authorize_project_access(
        conn, project_id, actor_id=actor_id, org_id=org_id,
        internal_context=internal_context,
    )


def _row(row: Mapping[str, Any]) -> dict[str, Any]:
    result = dict(row)
    result["error_message"] = redact(result.get("error_message"))
    return result


def _existing_or_conflict(row: Mapping[str, Any], fingerprint: str, instance_id: str | None) -> dict[str, Any]:
    if row["payload_fingerprint"] != fingerprint or row.get("instance_id") != instance_id:
        raise OperationConflictError("idempotency key was already used with a different operation identity")
    return _row(row)


def create_operation(
    project_id: str, kind: str, idempotency_key: str, payload: Any = None,
    *, instance_id: str | None = None, requested_by: str | None = None,
    org_id: str | None = None, actor_id: str | None = None,
    internal_context: TrustedInternalExecution | None = None,
    initial_status: str = "pending",
) -> dict[str, Any]:
    """Create or retrieve an operation atomically by project/idempotency key."""
    project_id = _text(project_id, "project_id")
    kind = _text(kind, "kind")
    idempotency_key = _text(idempotency_key, "idempotency_key")
    if initial_status not in OPERATION_STATES:
        raise InvalidOperationState(f"unknown operation state: {initial_status}")
    fingerprint = payload_fingerprint(kind, payload, instance_id=instance_id)
    operation_id, now = str(uuid.uuid4()), time.time()
    try:
        with pg.transaction() as conn:
            if initial_status not in {"pending", "queued"}:
                raise InvalidOperationState("caller may only create pending or queued operations")
            derived_org = _project_access(conn, project_id, org_id, actor_id, internal_context)
            if instance_id:
                instance = conn.execute(
                    "SELECT project_id, org_id FROM service_instances WHERE id = %s FOR SHARE",
                    (instance_id,),
                ).fetchone()
                if not instance or instance["project_id"] != project_id or instance["org_id"] != derived_org:
                    raise ProjectAuthorizationError("instance does not belong to this project")
            existing = conn.execute(
                "SELECT * FROM service_operations WHERE project_id = %s AND idempotency_key = %s FOR UPDATE",
                (project_id, idempotency_key),
            ).fetchone()
            if existing:
                return _existing_or_conflict(existing, fingerprint, instance_id)
            conn.execute(
                "INSERT INTO service_operations "
                "(id,org_id,project_id,instance_id,kind,idempotency_key,payload_fingerprint,status,requested_by,"
                "error_code,error_message,started_at,finished_at,created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,NULL,NULL,NULL,%s)",
                (operation_id, derived_org, project_id, instance_id, kind, idempotency_key,
                 fingerprint, initial_status, requested_by, now),
            )
            row = conn.execute("SELECT * FROM service_operations WHERE id = %s", (operation_id,)).fetchone()
            return _row(row)
    except psycopg_errors.UniqueViolation:
        # A concurrent creator may win the unique key between the SELECT and
        # INSERT.  The committed winner is now the authoritative retry result.
        existing = pg.query_one(
            "SELECT * FROM service_operations WHERE project_id = %s AND idempotency_key = %s",
            (project_id, idempotency_key),
        )
        if existing:
            return _existing_or_conflict(existing, fingerprint, instance_id)
        raise


def get_operation(project_id: str, operation_id: str, *, org_id: str | None = None,
                  actor_id: str | None = None,
                  internal_context: TrustedInternalExecution | None = None) -> dict[str, Any] | None:
    with pg.transaction() as conn:
        _project_access(conn, project_id, org_id, actor_id, internal_context)
        row = conn.execute(
            "SELECT * FROM service_operations WHERE id = %s AND project_id = %s",
            (operation_id, project_id),
        ).fetchone()
    return _row(row) if row else None


def require_operation(project_id: str, operation_id: str, **kwargs: Any) -> dict[str, Any]:
    result = get_operation(project_id, operation_id, **kwargs)
    if result is None:
        raise OperationNotFoundError("service operation not found")
    return result


def list_operations(project_id: str, *, instance_id: str | None = None,
                    status: str | None = None, limit: int = 100,
                    org_id: str | None = None, actor_id: str | None = None,
                    internal_context: TrustedInternalExecution | None = None) -> list[dict[str, Any]]:
    if status is not None and status not in OPERATION_STATES:
        raise InvalidOperationState(f"unknown operation state: {status}")
    try:
        limit = max(1, min(int(limit), 500))
    except (TypeError, ValueError):
        raise ServiceOperationError("limit must be an integer") from None
    clauses = ["project_id = %s"]
    params: list[Any] = [project_id]
    if instance_id is not None:
        clauses.append("instance_id = %s")
        params.append(instance_id)
    if status is not None:
        clauses.append("status = %s")
        params.append(status)
    params.append(limit)
    with pg.transaction() as conn:
        _project_access(conn, project_id, org_id, actor_id, internal_context)
        rows = conn.execute(
            f"SELECT * FROM service_operations WHERE {' AND '.join(clauses)} "
            "ORDER BY created_at DESC LIMIT %s", tuple(params),
        ).fetchall()
    return [_row(row) for row in rows]


def transition_operation(
    project_id: str, operation_id: str, status: str, *, expected_status: str | None = None,
    error_code: str | None = None, error_message: str | None = None,
    org_id: str | None = None, actor_id: str | None = None,
    internal_context: TrustedInternalExecution | None = None,
) -> dict[str, Any]:
    """CAS transition an operation, with terminal timestamps and safe errors."""
    if status not in OPERATION_STATES:
        raise InvalidOperationState(f"unknown operation state: {status}")
    with pg.transaction() as conn:
        _project_access(conn, project_id, org_id, actor_id, internal_context)
        row = conn.execute(
            "SELECT * FROM service_operations WHERE id = %s AND project_id = %s FOR UPDATE",
            (operation_id, project_id),
        ).fetchone()
        if not row:
            raise OperationNotFoundError("service operation not found")
        current = str(row["status"])
        if expected_status is not None and current != expected_status:
            raise OperationConflictError(f"operation status changed from {expected_status}")
        if current in {"succeeded", "failed", "canceled"}:
            same_error = (error_code is None or error_code == row["error_code"]) and (
                error_message is None or redact(error_message) == row["error_message"]
            )
            if status == current and same_error:
                return _row(row)
            raise OperationConflictError("terminal operation result is immutable")
        if status not in OPERATION_TRANSITIONS[current]:
            raise InvalidOperationState(f"invalid operation transition: {current} -> {status}")
        now = time.time()
        started_at = row["started_at"]
        if status == "running" and started_at is None:
            started_at = now
        finished_at = row["finished_at"]
        if status in {"succeeded", "failed", "canceled"}:
            finished_at = now
        safe_error = redact(error_message) if error_message is not None else row["error_message"]
        conn.execute(
            "UPDATE service_operations SET status = %s, error_code = %s, error_message = %s, "
            "started_at = %s, finished_at = %s WHERE id = %s AND project_id = %s AND status = %s",
            (status, error_code, safe_error, started_at, finished_at, operation_id, project_id, current),
        )
        updated = conn.execute("SELECT * FROM service_operations WHERE id = %s", (operation_id,)).fetchone()
    return _row(updated)


# Common worker-facing naming.
update_status = transition_operation
