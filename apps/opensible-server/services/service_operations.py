"""Tenant-scoped, idempotent service operation persistence."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import time
import uuid
from typing import Any, Mapping

from psycopg import errors as psycopg_errors
from psycopg.types.json import Jsonb

from storage import pg
from services.runtime_provider import RUNTIME_ERROR_CODES, redact
from services import service_instances
from services.service_instances import (
    ProjectAuthorizationError,
    ProjectNotFoundError,
    TrustedInternalExecution,
    _authorize_project_access,
    _is_trusted_internal,
    _project_context,
    redact_spec,
)

_ERROR_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]{1,63}$")
_ALLOWED_ERROR_CODES = RUNTIME_ERROR_CODES | frozenset({"OPERATION_FAILED", "OPERATION_CANCELED"})
_SAFE_ERROR_CODE = "OPERATION_FAILED"


def _safe_error_code(value: Any) -> str | None:
    if value is None:
        return None
    candidate = str(value).strip().upper()
    if candidate in _ALLOWED_ERROR_CODES and _ERROR_CODE_RE.fullmatch(candidate):
        return candidate
    return _SAFE_ERROR_CODE


def _safe_error_message(value: Any) -> str | None:
    if value is None:
        return None
    return str(redact(str(value)))[:2000]

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


def _validate_operation_row(conn: Any, row: Mapping[str, Any]) -> None:
    project = conn.execute("SELECT org_id FROM projects WHERE id = %s", (row["project_id"],)).fetchone()
    if not project or str(row.get("org_id")) != str(project["org_id"]):
        raise ProjectAuthorizationError("operation tenant does not match project tenant")
    instance_id = row.get("instance_id")
    if instance_id is not None:
        instance = conn.execute(
            "SELECT org_id, project_id FROM service_instances WHERE id = %s",
            (instance_id,),
        ).fetchone()
        if not instance or str(instance["org_id"]) != str(row["org_id"]) or str(instance["project_id"]) != str(row["project_id"]):
            raise ProjectAuthorizationError("operation instance does not match its tenant")


def _row(row: Mapping[str, Any]) -> dict[str, Any]:
    result = dict(row)
    result["error_code"] = _safe_error_code(result.get("error_code"))
    result["error_message"] = _safe_error_message(result.get("error_message"))
    return result


def _operation_event_tx(conn: Any, operation_id: str, event: str, *, message: str | None = None,
                        details: Mapping[str, Any] | None = None) -> None:
    """Append one safe lifecycle event while the operation row is locked."""
    safe_details = redact(dict(details or {}))
    conn.execute(
        "INSERT INTO service_operation_events(operation_id,event,message,details,created_at) "
        "VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
        (
            operation_id, event, redact(message) if message is not None else None,
            Jsonb(safe_details), time.time(),
        ),
    )


def _audit_lifecycle(
    conn: Any,
    action: str,
    *,
    actor_id: str | None,
    org_id: str | None,
    project_id: str,
    instance_id: str | None,
    operation: Mapping[str, Any],
    before: str | None,
    after: str | None,
    metadata: Mapping[str, Any] | None = None,
) -> None:
    """Write a safe lifecycle audit row in the same transaction as the change."""
    safe_meta = redact({
        "actor": actor_id,
        "org_id": org_id,
        "project_id": project_id,
        "instance_id": instance_id,
        "operation_id": operation.get("id"),
        "operation": operation.get("kind"),
        "before": before,
        "after": after,
        **dict(metadata or {}),
    })
    conn.execute(
        "INSERT INTO audit_log(actor_user_id, action, target_type, target_id, meta_json, created_at) "
        "VALUES (%s,%s,%s,%s,%s,%s)",
        (
            actor_id,
            action,
            "service_operation",
            str(operation.get("id")),
            json.dumps(safe_meta, ensure_ascii=False, sort_keys=True),
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
        ),
    )


def _existing_or_conflict(row: Mapping[str, Any], fingerprint: str, instance_id: str | None) -> dict[str, Any]:
    if row["payload_fingerprint"] != fingerprint or row.get("instance_id") != instance_id:
        raise OperationConflictError("idempotency key was already used with a different operation identity")
    return _row(row)


def _revision_fingerprint(spec: Any) -> str:
    """Fingerprint the normalized, redacted desired spec for retry identity."""
    safe_spec = redact_spec(spec if isinstance(spec, Mapping) else {})
    encoded = json.dumps(safe_spec, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


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
                # Serialize all lifecycle requests for one instance. The lock is
                # held through the active-operation check and insert, so two
                # different idempotency keys cannot both become active.
                instance = conn.execute(
                    "SELECT project_id, org_id FROM service_instances WHERE id = %s FOR UPDATE",
                    (instance_id,),
                ).fetchone()
                if not instance or instance["project_id"] != project_id or instance["org_id"] != derived_org:
                    raise ProjectAuthorizationError("instance does not belong to this project")
            existing = conn.execute(
                "SELECT * FROM service_operations WHERE project_id = %s AND idempotency_key = %s FOR UPDATE",
                (project_id, idempotency_key),
            ).fetchone()
            if existing:
                _validate_operation_row(conn, existing)
                return _existing_or_conflict(existing, fingerprint, instance_id)
            if instance_id:
                active = conn.execute(
                    "SELECT id, kind FROM service_operations "
                    "WHERE project_id = %s AND instance_id = %s "
                    "AND status IN ('pending','queued','running') "
                    "ORDER BY created_at DESC LIMIT 1",
                    (project_id, instance_id),
                ).fetchone()
                if active:
                    raise OperationConflictError(
                        f"another service operation is already active ({active['id']})"
                    )
            conn.execute(
                "INSERT INTO service_operations "
                "(id,org_id,project_id,instance_id,kind,idempotency_key,payload_fingerprint,payload,status,requested_by,"
                "error_code,error_message,started_at,finished_at,created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,NULL,NULL,NULL,%s)",
                (operation_id, derived_org, project_id, instance_id, kind, idempotency_key,
                 fingerprint, Jsonb(redact(_canonical_payload(payload))),
                 initial_status, requested_by, now),
            )
            row = conn.execute("SELECT * FROM service_operations WHERE id = %s", (operation_id,)).fetchone()
            if initial_status == "queued":
                _operation_event_tx(conn, operation_id, "queued", message="operation queued")
            _audit_lifecycle(
                conn, "service.operation.created", actor_id=requested_by,
                org_id=derived_org, project_id=project_id, instance_id=instance_id,
                operation=row, before=None, after=initial_status,
                metadata={"idempotency_key": idempotency_key},
            )
            return _row(row)
    except psycopg_errors.UniqueViolation:
        # A concurrent creator may win the unique key between the SELECT and
        # INSERT.  The committed winner is now the authoritative retry result.
        existing = pg.query_one(
            "SELECT * FROM service_operations WHERE project_id = %s AND idempotency_key = %s",
            (project_id, idempotency_key),
        )
        if existing:
            with pg.transaction() as conn:
                _validate_operation_row(conn, existing)
            return _existing_or_conflict(existing, fingerprint, instance_id)
        raise


def create_instance_and_deploy(
    project_id: str, name: str, definition_slug: str, definition_version: str,
    environment: str, runtime_id: str, spec: Mapping[str, Any],
    idempotency_key: str, *, requested_by: str | None = None,
    org_id: str | None = None, actor_id: str | None = None,
    internal_context: TrustedInternalExecution | None = None,
    confirmation_context: Mapping[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Atomically create a draft revision and queue its first deploy.

    The create idempotency key covers both rows. A retry returns the original
    instance/operation only when the normalized create request is identical.
    No provider is invoked here; workers consume the queued operation later.
    """
    project_id = _text(project_id, "project_id")
    name = service_instances._text(name, "name")
    environment = service_instances._text(environment, "environment")
    runtime_id = service_instances._text(runtime_id, "runtime_id")
    definition_slug = service_instances._text(definition_slug, "definition_slug")
    definition_version = service_instances._text(definition_version, "definition_version")
    key = _text(idempotency_key, "idempotency_key")
    if len(key) > 255:
        raise ServiceOperationError("idempotency key is too long")
    safe_spec = redact_spec(spec)
    create_fingerprint = service_instances.create_request_fingerprint(
        name, definition_slug, definition_version, environment, runtime_id, safe_spec,
    )
    with pg.transaction() as conn:
        derived_org = _project_access(conn, project_id, org_id, actor_id, internal_context)
        if environment == "production":
            confirmation_metadata = service_instances._production_confirmation_metadata(
                project_id, create_fingerprint, confirmation_context,
                expected_identity=actor_id or requested_by,
            )
        else:
            confirmation_metadata = None
        # Serialize the complete create+deploy unit by its project/key identity.
        # This closes the window where two callers both pass the initial lookup,
        # then one loses on the instance name unique constraint before its
        # operation row can reconcile the winning request.
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (f"service-create-deploy:{project_id}:{key}",),
        )
        existing = conn.execute(
            "SELECT * FROM service_operations WHERE project_id=%s AND idempotency_key=%s FOR UPDATE",
            (project_id, key),
        ).fetchone()
        if existing:
            _validate_operation_row(conn, existing)
            payload = existing.get("payload") or {}
            if str(existing.get("kind")) != "service.deploy" or payload.get("create_fingerprint") != create_fingerprint:
                raise OperationConflictError("idempotency key was already used with a different create request")
            instance = conn.execute(
                "SELECT * FROM service_instances WHERE id=%s AND project_id=%s",
                (existing.get("instance_id"), project_id),
            ).fetchone()
            revision_id = payload.get("desired_revision_id")
            revision = conn.execute(
                "SELECT * FROM service_revisions WHERE id=%s AND instance_id=%s",
                (revision_id, existing.get("instance_id")),
            ).fetchone()
            if not instance or not revision:
                raise OperationConflictError("idempotent create operation is unavailable")
            return service_instances._row(instance), _row(existing)

        # Serialize the name and operation identity together with the insert.
        active = conn.execute(
            "SELECT id FROM service_operations WHERE project_id=%s AND instance_id IN "
            "(SELECT id FROM service_instances WHERE project_id=%s AND environment=%s AND name=%s) "
            "AND status IN ('pending','queued','running') LIMIT 1",
            (project_id, project_id, environment, name),
        ).fetchone()
        if active:
            raise OperationConflictError(f"another service operation is already active ({active['id']})")
        instance_id, revision_id, now = str(uuid.uuid4()), str(uuid.uuid4()), time.time()
        try:
            conn.execute(
                "INSERT INTO service_instances "
                "(id,org_id,project_id,name,definition_slug,definition_version,environment,runtime_id,status,"
                "desired_revision_id,provider_ref,endpoint_summary,archived,created_by,created_at,updated_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'draft',%s,NULL,NULL,FALSE,%s,%s,%s)",
                (instance_id, derived_org, project_id, name, definition_slug, definition_version,
                 environment, runtime_id, revision_id, requested_by, now, now),
            )
            conn.execute(
                "INSERT INTO service_revisions "
                "(id,instance_id,revision_number,spec,redacted_spec,created_by,created_at) "
                "VALUES (%s,%s,1,%s,%s,%s,%s)",
                (revision_id, instance_id, Jsonb(safe_spec), Jsonb(safe_spec), requested_by, now),
            )
        except psycopg_errors.UniqueViolation as exc:
            raise service_instances.InstanceConflictError(
                "service name already exists in this project and environment"
            ) from exc
        payload = {
            "operation": "deploy", "desired_revision_id": revision_id,
            "create_fingerprint": create_fingerprint,
        }
        operation_id = str(uuid.uuid4())
        fingerprint = payload_fingerprint("service.deploy", payload, instance_id=instance_id)
        conn.execute(
            "INSERT INTO service_operations "
            "(id,org_id,project_id,instance_id,kind,idempotency_key,payload_fingerprint,payload,status,requested_by,"
            "error_code,error_message,started_at,finished_at,created_at) "
            "VALUES (%s,%s,%s,%s,'service.deploy',%s,%s,%s,'queued',%s,NULL,NULL,NULL,NULL,%s)",
            (operation_id, derived_org, project_id, instance_id, key, fingerprint,
             Jsonb(payload), requested_by, now),
        )
        instance = conn.execute("SELECT * FROM service_instances WHERE id=%s", (instance_id,)).fetchone()
        operation = conn.execute("SELECT * FROM service_operations WHERE id=%s", (operation_id,)).fetchone()
        _operation_event_tx(conn, operation_id, "queued", message="operation queued")
        service_instances._audit_instance(
            conn, "service.instance.created", actor_id=requested_by, row=instance,
            after="draft", metadata={
                "definition_slug": definition_slug,
                "definition_version": definition_version,
                "runtime_id": runtime_id,
                "deploy_queued": True,
                **({"confirmation": confirmation_metadata} if confirmation_metadata else {}),
            },
        )
        _audit_lifecycle(
            conn, "service.operation.created", actor_id=requested_by, org_id=derived_org,
            project_id=project_id, instance_id=instance_id, operation=operation,
            before=None, after="queued", metadata={
                "idempotency_key": key,
                "create_fingerprint": create_fingerprint,
                **({"confirmation": confirmation_metadata} if confirmation_metadata else {}),
            },
        )
    return service_instances._row(instance), _row(operation)


def create_revision_and_operation(
    project_id: str,
    instance_id: str,
    kind: str,
    idempotency_key: str,
    spec: Mapping[str, Any],
    *,
    target_revision_id: str | None = None,
    requested_by: str | None = None,
    org_id: str | None = None,
    actor_id: str | None = None,
    internal_context: TrustedInternalExecution | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Atomically append a desired revision and queue its operation.

    This is used by update and rollback so a rejected/conflicting request cannot
    leave an orphan desired revision. The instance lock serializes revision
    numbering, target validation, active-operation checks, and operation insert.
    Retries resolve both rows through the same idempotency key.
    """
    project_id = _text(project_id, "project_id")
    instance_id = _text(instance_id, "instance_id")
    kind = _text(kind, "kind")
    key = _text(idempotency_key, "idempotency_key")
    if len(key) > 255:
        raise ServiceOperationError("idempotency key is too long")
    if kind not in {"service.update", "service.rollback"}:
        raise ServiceOperationError("revision-backed operation kind is unsupported")
    safe_spec = redact_spec(spec)
    revision_fingerprint = _revision_fingerprint(safe_spec)
    with pg.transaction() as conn:
        derived_org = _project_access(conn, project_id, org_id, actor_id, internal_context)
        instance = conn.execute(
            "SELECT * FROM service_instances WHERE id=%s AND project_id=%s FOR UPDATE",
            (instance_id, project_id),
        ).fetchone()
        if not instance or str(instance.get("org_id")) != str(derived_org):
            raise ProjectAuthorizationError("instance does not belong to this project")

        existing_operation = conn.execute(
            "SELECT * FROM service_operations WHERE project_id=%s AND idempotency_key=%s FOR UPDATE",
            (project_id, key),
        ).fetchone()
        if existing_operation:
            _validate_operation_row(conn, existing_operation)
            payload = existing_operation.get("payload") or {}
            expected_target = payload.get("rollback_target_revision_id") if isinstance(payload, Mapping) else None
            if kind == "service.rollback" and str(expected_target or "") != str(target_revision_id or ""):
                raise OperationConflictError("idempotency key was already used with a different rollback target")
            if str(existing_operation.get("kind")) != kind:
                raise OperationConflictError("idempotency key was already used with a different operation identity")
            revision_id = payload.get("desired_revision_id") if isinstance(payload, Mapping) else None
            revision = conn.execute(
                "SELECT * FROM service_revisions WHERE id=%s AND instance_id=%s",
                (revision_id, instance_id),
            ).fetchone()
            if not revision:
                raise OperationConflictError("idempotent operation revision is unavailable")
            if _revision_fingerprint(revision.get("spec") or {}) != revision_fingerprint:
                raise OperationConflictError("idempotency key was already used with a different revision")
            expected_payload: dict[str, Any] = {
                "operation": kind.removeprefix("service."),
                "desired_revision_id": str(revision_id),
            }
            if kind == "service.rollback":
                expected_payload["rollback_target_revision_id"] = str(target_revision_id)
            expected_fingerprint = payload_fingerprint(kind, expected_payload, instance_id=instance_id)
            if existing_operation.get("payload_fingerprint") != expected_fingerprint:
                raise OperationConflictError("idempotency key was already used with a different operation payload")
            return service_instances._revision_row(revision), _row(existing_operation)

        active = conn.execute(
            "SELECT id,kind FROM service_operations WHERE project_id=%s AND instance_id=%s "
            "AND status IN ('pending','queued','running') ORDER BY created_at DESC LIMIT 1",
            (project_id, instance_id),
        ).fetchone()
        if active:
            raise OperationConflictError(f"another service operation is already active ({active['id']})")

        current_revision_id = instance.get("desired_revision_id")
        if kind == "service.rollback":
            target = conn.execute(
                "SELECT * FROM service_revisions WHERE id=%s AND instance_id=%s",
                (target_revision_id, instance_id),
            ).fetchone()
            current = conn.execute(
                "SELECT revision_number FROM service_revisions WHERE id=%s AND instance_id=%s",
                (current_revision_id, instance_id),
            ).fetchone()
            # Validate the target while the instance lock is held. This keeps
            # rejection entirely inside the transaction: no revision, desired
            # pointer, or operation can survive an invalid rollback request.
            if not target:
                raise service_instances.RevisionConflictError("rollback target revision is not part of this service")
            if not current or str(target["id"]) == str(current_revision_id) or int(target["revision_number"]) >= int(current["revision_number"]):
                raise service_instances.RevisionConflictError("rollback must target a prior immutable revision")

        revision_key = f"{key}:revision"
        existing_revision = conn.execute(
            "SELECT r.*, k.payload_fingerprint FROM service_revision_idempotency k "
            "JOIN service_revisions r ON r.id=k.revision_id "
            "WHERE k.instance_id=%s AND k.idempotency_key=%s FOR UPDATE",
            (instance_id, revision_key),
        ).fetchone()
        if existing_revision:
            if existing_revision.get("payload_fingerprint") != revision_fingerprint:
                raise RevisionConflictError("idempotency key was already used with a different revision")
            revision_id = str(existing_revision["id"])
            revision = existing_revision
        else:
            max_row = conn.execute(
                "SELECT COALESCE(MAX(revision_number),0) AS revision_number FROM service_revisions WHERE instance_id=%s",
                (instance_id,),
            ).fetchone()
            revision_id, now = str(uuid.uuid4()), time.time()
            number = int(max_row["revision_number"]) + 1
            conn.execute(
                "INSERT INTO service_revisions (id,instance_id,revision_number,spec,redacted_spec,created_by,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (revision_id, instance_id, number, Jsonb(safe_spec), Jsonb(safe_spec), requested_by, now),
            )
            conn.execute(
                "INSERT INTO service_revision_idempotency(instance_id,idempotency_key,payload_fingerprint,revision_id,created_at) VALUES (%s,%s,%s,%s,%s)",
                (instance_id, revision_key, revision_fingerprint, revision_id, now),
            )
            conn.execute(
                "UPDATE service_instances SET desired_revision_id=%s,updated_at=%s WHERE id=%s",
                (revision_id, now, instance_id),
            )
            revision = conn.execute("SELECT * FROM service_revisions WHERE id=%s", (revision_id,)).fetchone()

        payload: dict[str, Any] = {"operation": kind.removeprefix("service."), "desired_revision_id": revision_id}
        if kind == "service.rollback":
            payload["rollback_target_revision_id"] = str(target_revision_id)
        fingerprint = payload_fingerprint(kind, payload, instance_id=instance_id)
        operation_id, now = str(uuid.uuid4()), time.time()
        conn.execute(
            "INSERT INTO service_operations (id,org_id,project_id,instance_id,kind,idempotency_key,payload_fingerprint,payload,status,requested_by,error_code,error_message,started_at,finished_at,created_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'queued',%s,NULL,NULL,NULL,NULL,%s)",
            (operation_id, derived_org, project_id, instance_id, kind, key, fingerprint, Jsonb(payload), requested_by, now),
        )
        operation = conn.execute("SELECT * FROM service_operations WHERE id=%s", (operation_id,)).fetchone()
        _operation_event_tx(conn, operation_id, "queued", message="operation queued")
        _audit_lifecycle(
            conn, "service.operation.created", actor_id=requested_by, org_id=derived_org,
            project_id=project_id, instance_id=instance_id, operation=operation,
            before=None, after="queued", metadata={"idempotency_key": key, "revision_id": revision_id},
        )
    return service_instances._revision_row(revision), _row(operation)


def get_operation(project_id: str, operation_id: str, *, org_id: str | None = None,
                  actor_id: str | None = None,
                  internal_context: TrustedInternalExecution | None = None) -> dict[str, Any] | None:
    with pg.transaction() as conn:
        _project_access(conn, project_id, org_id, actor_id, internal_context)
        row = conn.execute(
            "SELECT * FROM service_operations WHERE id = %s AND project_id = %s",
            (operation_id, project_id),
        ).fetchone()
        if row:
            _validate_operation_row(conn, row)
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
        for row in rows:
            _validate_operation_row(conn, row)
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
        _validate_operation_row(conn, row)
        current = str(row["status"])
        if expected_status is not None and current != expected_status:
            raise OperationConflictError(f"operation status changed from {expected_status}")
        if current in {"succeeded", "failed", "canceled"}:
            safe_code = _safe_error_code(error_code)
            safe_message = _safe_error_message(error_message)
            same_error = (error_code is None or safe_code == _safe_error_code(row["error_code"])) and (
                error_message is None or safe_message == _safe_error_message(row["error_message"])
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
        safe_code = _safe_error_code(error_code) if error_code is not None else row["error_code"]
        safe_error = _safe_error_message(error_message) if error_message is not None else row["error_message"]
        conn.execute(
            "UPDATE service_operations SET status = %s, error_code = %s, error_message = %s, "
            "started_at = %s, finished_at = %s WHERE id = %s AND project_id = %s AND status = %s",
            (status, safe_code, safe_error, started_at, finished_at, operation_id, project_id, current),
        )
        updated = conn.execute("SELECT * FROM service_operations WHERE id = %s", (operation_id,)).fetchone()
        if status == "queued":
            _operation_event_tx(conn, operation_id, "queued", message="operation queued")
        elif status in {"succeeded", "failed", "canceled"}:
            _operation_event_tx(
                conn, operation_id, status,
                details={"error_code": safe_code} if status != "succeeded" else {},
            )
        _audit_lifecycle(
            conn, "service.operation.transitioned", actor_id=actor_id,
            org_id=updated.get("org_id"), project_id=project_id,
            instance_id=updated.get("instance_id"), operation=updated,
            before=current, after=status,
            metadata={"error_code": safe_code} if safe_code else None,
        )
    return _row(updated)


# Common worker-facing naming.
update_status = transition_operation
