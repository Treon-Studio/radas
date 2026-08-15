"""Project-scoped service instance and immutable revision persistence.

This module is deliberately provider-neutral.  It stores desired revisions and
observed provider state separately; workers and HTTP routes can build on these
functions without gaining a way to bypass project tenancy.
"""
from __future__ import annotations

import copy
import hmac
import json
import os
import re
import time
import uuid
from dataclasses import dataclass
from typing import Any, Mapping

from psycopg import errors as psycopg_errors
from psycopg.types.json import Jsonb

from storage import pg
from services.runtime_provider import redact

INSTANCE_STATES = frozenset({
    "draft", "provisioning", "running", "degraded", "stopped",
    "updating", "destroying", "destroyed", "failed",
})

# The graph is intentionally conservative.  A provider may report the same
# state repeatedly, but cannot jump over lifecycle states arbitrarily.
INSTANCE_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"draft", "provisioning", "destroying", "failed"}),
    "provisioning": frozenset({"provisioning", "running", "degraded", "failed", "destroying"}),
    "running": frozenset({"running", "degraded", "stopped", "updating", "destroying", "failed"}),
    "degraded": frozenset({"degraded", "running", "stopped", "updating", "destroying", "failed"}),
    "stopped": frozenset({"stopped", "running", "updating", "destroying", "destroyed", "failed"}),
    "updating": frozenset({"updating", "running", "degraded", "failed", "destroying"}),
    "destroying": frozenset({"destroying", "destroyed", "failed"}),
    "destroyed": frozenset({"destroyed"}),
    "failed": frozenset({"failed", "draft", "provisioning", "updating", "destroying"}),
}

_SENSITIVE_KEY = re.compile(
    r"(?:secret|password|credential|token|private.?key|api.?key|access.?key|authorization|bearer)",
    re.IGNORECASE,
)
_SAFE_REFERENCE_KEYS = {"ref", "reference", "secret_ref", "secret_id", "id", "name"}
_REDACTED = "[REDACTED]"


class ServiceInstanceError(ValueError):
    """Base class for service instance boundary errors."""


class ProjectNotFoundError(ServiceInstanceError):
    pass


class ProjectAuthorizationError(ServiceInstanceError):
    pass


class InstanceNotFoundError(LookupError):
    pass


class InstanceConflictError(ServiceInstanceError):
    pass


class InvalidInstanceState(ServiceInstanceError):
    pass


class RevisionConflictError(ServiceInstanceError):
    pass


@dataclass(frozen=True)
class TrustedInternalExecution:
    """Explicit credential for worker/internal service execution paths."""

    token: str


def internal_execution_context(token: str | None = None) -> TrustedInternalExecution:
    """Build a trusted internal context from the configured server secret."""
    configured = os.environ.get("INTERNAL_CALL_SECRET", "")
    supplied = token if token is not None else configured
    if not configured or not supplied or not hmac.compare_digest(str(supplied), configured):
        raise ProjectAuthorizationError("trusted internal execution context required")
    return TrustedInternalExecution(str(supplied))


def _is_trusted_internal(context: TrustedInternalExecution | None) -> bool:
    configured = os.environ.get("INTERNAL_CALL_SECRET", "")
    return bool(context and configured and hmac.compare_digest(context.token, configured))


def _text(value: Any, field: str) -> str:
    value = str(value or "").strip()
    if not value:
        raise ServiceInstanceError(f"{field} is required")
    return value


def _safe_spec(value: Any, *, sensitive_parent: bool = False) -> Any:
    """Copy JSON-compatible input and remove secret values.

    Secret references are metadata, not secret values, and are retained. A
    caller accidentally sending a raw secret therefore cannot cause it to be
    persisted; the value becomes the stable redaction marker instead.
    """
    if isinstance(value, Mapping):
        output: dict[str, Any] = {}
        for raw_key, child in value.items():
            key = str(raw_key)
            # ``secrets`` is a container of declared names, not itself a
            # credential. Preserve each canonical reference object while
            # dropping any unexpected fields or values.
            if key == "secrets" and isinstance(child, Mapping):
                safe_secrets: dict[str, Any] = {}
                for name, entry in child.items():
                    if isinstance(entry, Mapping) and set(map(str, entry)) == {"secret_ref"}:
                        reference = entry.get("secret_ref")
                        if isinstance(reference, str) and re.fullmatch(r"(?:secret://|ref:)[A-Za-z0-9][A-Za-z0-9._:/-]*", reference):
                            safe_secrets[str(name)] = {"secret_ref": reference}
                        else:
                            safe_secrets[str(name)] = _REDACTED
                    else:
                        safe_secrets[str(name)] = _REDACTED
                output[key] = safe_secrets
                continue
            sensitive = sensitive_parent or bool(_SENSITIVE_KEY.search(key))
            if sensitive:
                if isinstance(child, Mapping) and set(map(str, child)) <= _SAFE_REFERENCE_KEYS:
                    output[key] = _safe_spec(child)
                elif isinstance(child, str) and (child == _REDACTED or child.startswith(("secret://", "ref:"))):
                    output[key] = child
                else:
                    output[key] = _REDACTED
            else:
                output[key] = _safe_spec(child)
        return output
    if isinstance(value, list):
        return [_safe_spec(item, sensitive_parent=sensitive_parent) for item in value]
    if isinstance(value, tuple):
        return [_safe_spec(item, sensitive_parent=sensitive_parent) for item in value]
    if sensitive_parent:
        return _REDACTED
    if isinstance(value, (str, int, float, bool)) or value is None:
        return copy.deepcopy(value)
    raise ServiceInstanceError("spec must contain only JSON-compatible values")


def redact_spec(spec: Any) -> dict[str, Any]:
    """Validate and return a JSON object safe for persistence."""
    safe = _safe_spec(spec)
    if not isinstance(safe, dict):
        raise ServiceInstanceError("spec must be a JSON object")
    return safe


def _safe_provider(value: Any) -> Any:
    """Redact provider references/output while retaining useful metadata."""
    return redact(value) if value is not None else None


def _audit_instance(conn: Any, action: str, *, actor_id: str | None, row: Mapping[str, Any], before: Any = None, after: Any = None, metadata: Mapping[str, Any] | None = None) -> None:
    safe_meta = redact({
        "actor": actor_id, "org_id": row.get("org_id"), "project_id": row.get("project_id"),
        "instance_id": row.get("id"), "before": before, "after": after,
        **dict(metadata or {}),
    })
    conn.execute(
        "INSERT INTO audit_log(actor_user_id, action, target_type, target_id, meta_json, created_at) VALUES (%s,%s,%s,%s,%s,%s)",
        (actor_id, action, "service_instance", str(row.get("id")), json.dumps(safe_meta, sort_keys=True), time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())),
    )


def _project_context(conn: Any, project_id: str, requested_org_id: str | None = None) -> str:
    project_id = _text(project_id, "project_id")
    row = conn.execute("SELECT org_id FROM projects WHERE id = %s", (project_id,)).fetchone()
    if not row or not row.get("org_id"):
        raise ProjectNotFoundError("project not found")
    org_id = str(row["org_id"])
    if requested_org_id is not None and str(requested_org_id) != org_id:
        raise ProjectAuthorizationError("organization does not own this project")
    return org_id


def _authorize_project_access(conn: Any, project_id: str, *, actor_id: str | None,
                              org_id: str | None,
                              internal_context: TrustedInternalExecution | None = None) -> str:
    derived = _project_context(conn, project_id, org_id)
    if _is_trusted_internal(internal_context):
        return derived
    if not actor_id:
        raise ProjectAuthorizationError("authenticated actor required")
    member = conn.execute(
        "SELECT 1 FROM org_members WHERE org_id = %s AND user_id = %s",
        (derived, actor_id),
    ).fetchone()
    if not member:
        raise ProjectAuthorizationError("project access denied")
    return derived


def authorize_project_access(project_id: str, *, actor_id: str | None = None,
                             org_id: str | None = None,
                             internal_context: TrustedInternalExecution | None = None) -> str:
    """Derive a project's org and require a member or explicit worker context."""
    with pg.transaction() as conn:
        return _authorize_project_access(
            conn, project_id, actor_id=actor_id, org_id=org_id,
            internal_context=internal_context,
        )


def _validate_instance_row(conn: Any, row: Mapping[str, Any]) -> None:
    project = conn.execute("SELECT org_id FROM projects WHERE id = %s", (row["project_id"],)).fetchone()
    if not project or str(row.get("org_id")) != str(project["org_id"]):
        raise ProjectAuthorizationError("instance tenant does not match project tenant")
    desired = row.get("desired_revision_id")
    if desired is not None:
        revision = conn.execute(
            "SELECT instance_id FROM service_revisions WHERE id = %s", (desired,)
        ).fetchone()
        if not revision or revision["instance_id"] != row["id"]:
            raise RevisionConflictError("instance desired revision is invalid")


def _row(row: Mapping[str, Any]) -> dict[str, Any]:
    result = dict(row)
    for key in ("provider_ref", "endpoint_summary"):
        result[key] = _safe_provider(result.get(key))
    result["archived"] = bool(result.get("archived", False))
    return result


def _revision_row(row: Mapping[str, Any]) -> dict[str, Any]:
    result = dict(row)
    result["spec"] = redact_spec(result.get("spec", {}))
    result["redacted_spec"] = redact_spec(result.get("redacted_spec", {}))
    return result


def create_instance(
    project_id: str, name: str, definition_slug: str, definition_version: str,
    environment: str, runtime_id: str, spec: Mapping[str, Any],
    created_by: str | None = None, *, org_id: str | None = None,
    actor_id: str | None = None,
    internal_context: TrustedInternalExecution | None = None,
) -> dict[str, Any]:
    """Create a draft instance and its first immutable desired revision."""
    name = _text(name, "name")
    environment = _text(environment, "environment")
    definition_slug = _text(definition_slug, "definition_slug")
    definition_version = _text(definition_version, "definition_version")
    runtime_id = _text(runtime_id, "runtime_id")
    safe_spec = redact_spec(spec)
    instance_id, revision_id, now = str(uuid.uuid4()), str(uuid.uuid4()), time.time()
    with pg.transaction() as conn:
        derived_org = _authorize_project_access(
            conn, project_id, actor_id=actor_id, org_id=org_id,
            internal_context=internal_context,
        )
        try:
            conn.execute(
                "INSERT INTO service_instances "
                "(id,org_id,project_id,name,definition_slug,definition_version,environment,runtime_id,status,"
                "desired_revision_id,provider_ref,endpoint_summary,archived,created_by,created_at,updated_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'draft',%s,NULL,NULL,FALSE,%s,%s,%s)",
                (instance_id, derived_org, project_id, name, definition_slug, definition_version,
                 environment, runtime_id, revision_id, created_by, now, now),
            )
            conn.execute(
                "INSERT INTO service_revisions "
                "(id,instance_id,revision_number,spec,redacted_spec,created_by,created_at) "
                "VALUES (%s,%s,1,%s,%s,%s,%s)",
                (revision_id, instance_id, Jsonb(safe_spec), Jsonb(safe_spec), created_by, now),
            )
        except psycopg_errors.UniqueViolation as exc:
            raise InstanceConflictError("service name already exists in this project and environment") from exc
        row = conn.execute("SELECT * FROM service_instances WHERE id = %s", (instance_id,)).fetchone()
        _audit_instance(conn, "service.instance.created", actor_id=created_by, row=row, after=row.get("status"), metadata={"definition_slug": definition_slug, "definition_version": definition_version, "runtime_id": runtime_id})
    return _row(row)


def get_instance(project_id: str, instance_id: str, *, org_id: str | None = None,
                 actor_id: str | None = None,
                 internal_context: TrustedInternalExecution | None = None) -> dict[str, Any] | None:
    with pg.transaction() as conn:
        _authorize_project_access(conn, project_id, actor_id=actor_id, org_id=org_id, internal_context=internal_context)
        row = conn.execute(
            "SELECT * FROM service_instances WHERE id = %s AND project_id = %s",
            (instance_id, project_id),
        ).fetchone()
        if row:
            _validate_instance_row(conn, row)
    return _row(row) if row else None


def require_instance(project_id: str, instance_id: str, **kwargs: Any) -> dict[str, Any]:
    result = get_instance(project_id, instance_id, **kwargs)
    if result is None:
        raise InstanceNotFoundError("service instance not found")
    return result


def list_instances(project_id: str, *, environment: str | None = None,
                   status: str | None = None, include_archived: bool = False,
                   org_id: str | None = None, actor_id: str | None = None,
                   internal_context: TrustedInternalExecution | None = None) -> list[dict[str, Any]]:
    clauses = ["project_id = %s"]
    params: list[Any] = [project_id]
    if environment is not None:
        clauses.append("environment = %s")
        params.append(environment)
    if status is not None:
        if status not in INSTANCE_STATES:
            raise InvalidInstanceState(f"unknown instance state: {status}")
        clauses.append("status = %s")
        params.append(status)
    if not include_archived:
        clauses.append("archived = FALSE")
    with pg.transaction() as conn:
        _authorize_project_access(
            conn, project_id, actor_id=actor_id, org_id=org_id,
            internal_context=internal_context,
        )
        rows = conn.execute(
            f"SELECT * FROM service_instances WHERE {' AND '.join(clauses)} "
            "ORDER BY environment, name, created_at", tuple(params),
        ).fetchall()
        for row in rows:
            _validate_instance_row(conn, row)
    return [_row(row) for row in rows]


def get_revision(project_id: str, instance_id: str, revision_id: str | None = None,
                 revision_number: int | None = None, *, org_id: str | None = None,
                 actor_id: str | None = None,
                 internal_context: TrustedInternalExecution | None = None) -> dict[str, Any] | None:
    clauses = ["r.instance_id = %s", "i.project_id = %s"]
    params: list[Any] = [instance_id, project_id]
    if revision_id is not None:
        clauses.append("r.id = %s")
        params.append(revision_id)
    if revision_number is not None:
        clauses.append("r.revision_number = %s")
        params.append(revision_number)
    with pg.transaction() as conn:
        _authorize_project_access(
            conn, project_id, actor_id=actor_id, org_id=org_id,
            internal_context=internal_context,
        )
        row = conn.execute(
            "SELECT r.*, i.org_id, i.id AS owning_instance_id FROM service_revisions r "
            "JOIN service_instances i ON i.id = r.instance_id "
            f"WHERE {' AND '.join(clauses)}", tuple(params),
        ).fetchone()
        if row:
            _validate_instance_row(conn, {"id": row["owning_instance_id"], "project_id": project_id, "org_id": row["org_id"], "desired_revision_id": None})
    return _revision_row(row) if row else None


def create_revision(instance_id: str, spec: Mapping[str, Any], created_by: str | None = None,
                    *, project_id: str | None = None, org_id: str | None = None,
                    actor_id: str | None = None,
                    internal_context: TrustedInternalExecution | None = None) -> dict[str, Any]:
    """Append a new immutable desired revision and point the instance at it."""
    safe_spec = redact_spec(spec)
    with pg.transaction() as conn:
        query = "SELECT i.*, COALESCE(i.org_id, p.org_id) AS derived_org FROM service_instances i JOIN projects p ON p.id = i.project_id WHERE i.id = %s"
        row = conn.execute(query, (instance_id,)).fetchone()
        if not row or (project_id is not None and row["project_id"] != project_id):
            raise InstanceNotFoundError("service instance not found")
        derived_org = _project_context(conn, row["project_id"], org_id)
        if str(row["org_id"]) != derived_org:
            raise ProjectAuthorizationError("instance tenant does not match project tenant")
        _authorize_project_access(
            conn, row["project_id"], actor_id=actor_id, org_id=org_id,
            internal_context=internal_context,
        )
        # Lock the owning instance before allocating the next revision number;
        # PostgreSQL does not permit FOR UPDATE on an aggregate query.
        conn.execute("SELECT id FROM service_instances WHERE id = %s FOR UPDATE", (instance_id,))
        locked = conn.execute(
            "SELECT COALESCE(MAX(revision_number),0) AS revision_number FROM service_revisions "
            "WHERE instance_id = %s", (instance_id,)
        ).fetchone()
        number = int(locked["revision_number"]) + 1
        revision_id, now = str(uuid.uuid4()), time.time()
        conn.execute(
            "INSERT INTO service_revisions (id,instance_id,revision_number,spec,redacted_spec,created_by,created_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (revision_id, instance_id, number, Jsonb(safe_spec), Jsonb(safe_spec), created_by, now),
        )
        conn.execute(
            "UPDATE service_instances SET desired_revision_id = %s, updated_at = %s WHERE id = %s",
            (revision_id, now, instance_id),
        )
        created = conn.execute("SELECT * FROM service_revisions WHERE id = %s", (revision_id,)).fetchone()
        _audit_instance(conn, "service.instance.revision_created", actor_id=created_by, row=row, before=row.get("desired_revision_id"), after=revision_id, metadata={"revision_number": number})
    return _revision_row(created)


def update_observed_status(
    instance_id: str, status: str, *, project_id: str | None = None,
    org_id: str | None = None, expected_status: str | None = None,
    provider_ref: Any = None, endpoint_summary: Any = None,
    actor_id: str | None = None,
    internal_context: TrustedInternalExecution | None = None,
) -> dict[str, Any]:
    """CAS-update observed provider state without changing desired revision."""
    if status not in INSTANCE_STATES:
        raise InvalidInstanceState(f"unknown instance state: {status}")
    with pg.transaction() as conn:
        row = conn.execute("SELECT * FROM service_instances WHERE id = %s FOR UPDATE", (instance_id,)).fetchone()
        if not row or (project_id is not None and row["project_id"] != project_id):
            raise InstanceNotFoundError("service instance not found")
        derived = _authorize_project_access(
            conn, row["project_id"], actor_id=actor_id, org_id=org_id,
            internal_context=internal_context,
        )
        if row["org_id"] != derived:
            raise ProjectAuthorizationError("instance tenant does not match project tenant")
        current = str(row["status"])
        if expected_status is not None and current != expected_status:
            raise InstanceConflictError(f"instance status changed from {expected_status}")
        if status not in INSTANCE_TRANSITIONS[current]:
            raise InvalidInstanceState(f"invalid instance transition: {current} -> {status}")
        now = time.time()
        conn.execute(
            "UPDATE service_instances SET status = %s, provider_ref = COALESCE(%s, provider_ref), "
            "endpoint_summary = COALESCE(%s, endpoint_summary), updated_at = %s WHERE id = %s AND status = %s",
            (status, Jsonb(_safe_provider(provider_ref)) if provider_ref is not None else None,
             Jsonb(_safe_provider(endpoint_summary)) if endpoint_summary is not None else None,
             now, instance_id, current),
        )
        updated = conn.execute("SELECT * FROM service_instances WHERE id = %s", (instance_id,)).fetchone()
        _audit_instance(conn, "service.instance.transitioned", actor_id=actor_id, row=updated, before=current, after=status, metadata={"provider_ref": _safe_provider(provider_ref) if provider_ref is not None else None})
    return _row(updated)


# Explicit alias useful to workers and tests that name the CAS operation.
compare_and_set_status = update_observed_status
