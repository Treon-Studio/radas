"""Project-scoped service instance API (Phase 2, Task 2.1).

This module is deliberately a control-plane boundary.  It validates catalog
and runtime contracts and records desired state/queued operations, but never
calls a runtime provider.  Provider execution belongs to Task 2.2.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
from collections.abc import Mapping
from typing import Any

from flask import Blueprint, request

from api.platform_contracts import (
    error_response,
    operation_response,
    redact_sensitive,
    register_platform_blueprint_contracts,
    success_response,
)
from auth.middleware import require_project_access
from services import runtime_registry, service_catalog, service_instances, service_operations

bp = Blueprint("service_instance_api", __name__)
register_platform_blueprint_contracts(bp)

_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,62}$")
_SECRET_REF_RE = re.compile(r"(?:secret://|ref:)[A-Za-z0-9][A-Za-z0-9._:/-]*")
_ACTIVE_OPERATION_STATES = {"pending", "queued", "running"}
_OPERATION_NAMES = {"deploy", "update", "start", "stop", "restart", "destroy", "rollback"}

# Kept as a module-level seam for route tests and future application wiring.
_RUNTIME_REGISTRY = None


def _provider_validation_errors(runtime_id: str, spec: Mapping[str, Any]) -> list[dict[str, Any]]:
    try:
        validator = getattr(_runtime(), "validate", None)
    except Exception:
        validator = None
    if not callable(validator):
        # Test doubles and legacy adapters may expose only capabilities; the
        # concrete registry contract always provides validate().
        return []
    try:
        errors = validator(runtime_id, dict(spec))
    except runtime_registry.ProviderNotFoundError:
        return [{"code": "RUNTIME_UNSUPPORTED", "message": "Runtime is not registered", "details": {"runtime_id": runtime_id}}]
    return [dict(item) for item in errors if isinstance(item, Mapping)]


def _confirmation_token(instance: Mapping[str, Any]) -> str:
    revision_id = str(instance.get("desired_revision_id") or "")
    revision = service_instances.get_revision(
        str(instance["project_id"]), str(instance["id"]), revision_id=revision_id,
        **_auth_kwargs(str(instance["project_id"])),
    ) if revision_id else None
    revision_number = str((revision or {}).get("revision_number") or "")
    payload = f"{instance['id']}:{revision_id}:{revision_number}".encode()
    secret = (os.environ.get("INTERNAL_CALL_SECRET") or "confirmation").encode()
    return base64.urlsafe_b64encode(hmac.new(secret, payload, hashlib.sha256).digest()).decode().rstrip("=")


def _destroy_confirmation(instance: Mapping[str, Any], data: Mapping[str, Any]) -> tuple[bool, str]:
    identity = str(data.get("target_id") or data.get("service_id") or data.get("confirm_target") or "")
    revision = str(data.get("revision_id") or data.get("revision") or data.get("version") or "")
    token = str(data.get("impact_token") or data.get("confirmation_token") or "")
    current_revision = str(instance.get("desired_revision_id") or "")
    if token:
        return hmac.compare_digest(token, _confirmation_token(instance)), "token"
    confirmed = data.get("confirm") is True or data.get("confirmed") is True
    return bool(confirmed and identity == str(instance["id"]) and revision == current_revision), "snapshot"


def _user() -> dict[str, Any]:
    return getattr(request, "current_user", {}) or {}


def _actor_id() -> str | None:
    value = _user().get("user_id")
    return str(value) if value else None


def _auth_kwargs(project_id: str) -> dict[str, Any]:
    actor = _actor_id()
    if actor == "__internal__":
        return {"internal_context": service_instances.internal_execution_context()}
    return {"actor_id": actor}


def _json_body() -> tuple[dict[str, Any] | None, tuple[Any, int] | None]:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, error_response("SERVICE_VALIDATION_FAILED", "JSON object required", 422)
    return data, None


def _context(project_id: str, data: Mapping[str, Any] | None = None) -> tuple[str | None, tuple[Any, int] | None]:
    """Derive org from the project and reject client-selected tenant context."""
    data = data or {}
    requested_orgs: set[str] = set()
    for key in ("org_id", "orgId", "tenant_id", "tenantId"):
        value = data.get(key)
        if value is not None and str(value).strip():
            requested_orgs.add(str(value).strip())
    for header in ("X-Org-Id", "X-Tenant-Id"):
        value = request.headers.get(header)
        if value and value.strip():
            requested_orgs.add(value.strip())
    for key in ("org_id", "tenant_id"):
        value = request.args.get(key)
        if value and value.strip():
            requested_orgs.add(value.strip())
    requested_projects: set[str] = set()
    for key in ("project_id", "projectId"):
        value = data.get(key)
        if value is not None and str(value).strip():
            requested_projects.add(str(value).strip())
    for value in (request.headers.get("X-Project-Id"), request.args.get("project_id")):
        if value and value.strip():
            requested_projects.add(value.strip())
    if requested_projects != set() and requested_projects != {project_id}:
        return None, error_response("FORBIDDEN", "Project context does not match the route", 403)
    if requested_orgs:
        try:
            project_org = service_catalog.project_org_id(project_id)
        except Exception:
            project_org = None
        if not project_org:
            return None, error_response("PROJECT_NOT_FOUND", "Project not found", 404)
        if requested_orgs != {str(project_org)}:
            return None, error_response("FORBIDDEN", "Organization does not own this project", 403)
    try:
        org_id = service_instances.authorize_project_access(project_id, **_auth_kwargs(project_id))
    except service_instances.ProjectNotFoundError:
        return None, error_response("PROJECT_NOT_FOUND", "Project not found", 404)
    except service_instances.ProjectAuthorizationError:
        return None, error_response("FORBIDDEN", "Project access denied", 403)
    return org_id, None


def _runtime() -> runtime_registry.RuntimeProviderRegistry:
    global _RUNTIME_REGISTRY
    if _RUNTIME_REGISTRY is None:
        _RUNTIME_REGISTRY = runtime_registry.build_default_registry()
    return _RUNTIME_REGISTRY


def _catalog_values(data: Mapping[str, Any]) -> tuple[str, str]:
    slug = data.get("catalog_slug", data.get("definition_slug", data.get("slug")))
    version = data.get("catalog_version", data.get("definition_version", data.get("version")))
    return str(slug or "").strip(), str(version or "").strip()


def _manifest_error(errors: list[dict[str, Any]]) -> tuple[Any, int]:
    return error_response(
        "SERVICE_VALIDATION_FAILED",
        "Service specification is invalid",
        422,
        details={"errors": errors},
    )


def _runtime_for_manifest(runtime_id: str, manifest: Mapping[str, Any]) -> bool:
    supported = {str(value) for value in manifest.get("supported_runtimes", [])}
    if runtime_id in supported:
        return True
    # The deterministic mock and local adapter represent container runtimes;
    # they are intentionally usable with the catalog's "docker" contract.
    return runtime_id in {"mock", "local-container"} and "docker" in supported


def _type_error(name: str, message: str) -> dict[str, Any]:
    return {"path": f"spec.{name}", "code": "invalid", "message": message}


def _validate_storage(manifest: Mapping[str, Any], storage: Any) -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]]]:
    declarations = {str(item.get("name")): item for item in manifest.get("storage", []) if isinstance(item, Mapping)}
    if storage is None:
        if any(bool(item.get("required")) for item in declarations.values()):
            return None, [_type_error("storage", "required storage volumes are missing")]
        return [], []
    entries = [storage] if isinstance(storage, Mapping) else storage if isinstance(storage, list) else None
    if entries is None:
        return None, [_type_error("storage", "must be an object or list")]
    normalized: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(entries):
        path = f"storage[{index}]"
        if not isinstance(item, Mapping):
            errors.append(_type_error(path, "must be an object")); continue
        name = str(item.get("name") or "")
        declaration = declarations.get(name)
        if not declaration:
            errors.append(_type_error(f"{path}.name", "is not declared by the service catalog")); continue
        if name in seen:
            errors.append(_type_error(f"{path}.name", "is duplicated")); continue
        seen.add(name)
        size = item.get("size_gb", declaration.get("size_gb"))
        mount = item.get("mount_path", declaration.get("mount_path"))
        metadata = item.get("metadata", {})
        if not isinstance(size, (int, float)) or isinstance(size, bool) or size <= 0:
            errors.append(_type_error(f"{path}.size_gb", "must be a positive number"))
        if not isinstance(mount, str) or not mount.startswith("/") or mount == "/" or ".." in mount.split("/"):
            errors.append(_type_error(f"{path}.mount_path", "must be an absolute non-root path"))
        if not isinstance(metadata, Mapping):
            errors.append(_type_error(f"{path}.metadata", "must be an object")); metadata = {}
        for key, value in metadata.items():
            if re.search(r"(?:secret|password|token|credential|private.?key|api.?key|authorization|bearer|value)", str(key), re.IGNORECASE):
                errors.append(_type_error(f"{path}.metadata.{key}", "credential-like metadata is not allowed"))
            if isinstance(value, (Mapping, list)):
                errors.append(_type_error(f"{path}.metadata.{key}", "must be scalar metadata"))
        normalized.append({"name": name, "size_gb": size, "mount_path": mount, "metadata": dict(metadata)})
    missing = set(declarations) - seen
    for name in missing:
        if declarations[name].get("required"):
            errors.append(_type_error(f"storage.{name}", "is required"))
    return normalized, errors


def _secret_reference(value: Any) -> str | None:
    """Return the only accepted secret reference representation."""
    if (
        isinstance(value, Mapping)
        and set(str(key) for key in value) == {"secret_ref"}
        and isinstance(value.get("secret_ref"), str)
        and _SECRET_REF_RE.fullmatch(value["secret_ref"])
    ):
        return value["secret_ref"]
    if isinstance(value, str) and _SECRET_REF_RE.fullmatch(value):
        return value
    return None


def _validate_spec(manifest: Mapping[str, Any], spec: Any) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    if not isinstance(spec, dict):
        return None, [{"path": "spec", "code": "object_required", "message": "spec must be an object"}]
    normalized = dict(spec)
    errors: list[dict[str, Any]] = []
    declarations = {str(item.get("name")): item for item in manifest.get("inputs", []) if isinstance(item, Mapping)}
    secret_declarations = {
        str(item.get("name")): item for item in manifest.get("secrets", []) if isinstance(item, Mapping)
    }
    # An input declared as type=secret is subject to the same reference-only
    # contract as an entry in manifest.secrets.
    for name, declaration in declarations.items():
        if declaration.get("type") == "secret":
            secret_declarations.setdefault(name, declaration)
    secret_names = set(secret_declarations)
    for key in normalized:
        if key in {"name", "environment", "runtime_id", "catalog_slug", "catalog_version", "secrets", "storage", "image"}:
            continue
        if key not in declarations and key not in secret_names:
            errors.append(_type_error(key, "is not declared by the service catalog"))
    for name, declaration in declarations.items():
        if name in secret_names:
            continue
        if name not in normalized:
            if declaration.get("required") and declaration.get("default") is None:
                errors.append(_type_error(name, "is required"))
            elif declaration.get("default") is not None:
                normalized[name] = declaration["default"]
            continue
        value = normalized[name]
        kind = declaration.get("type")
        valid = (
            kind in {"string", "domain", "url"} and isinstance(value, str)
        ) or (
            kind in {"integer", "port"} and isinstance(value, int) and not isinstance(value, bool)
        ) or (
            kind == "number" and isinstance(value, (int, float)) and not isinstance(value, bool)
        ) or (kind == "boolean" and isinstance(value, bool)) or (
            kind == "enum" and isinstance(value, str) and value in (declaration.get("choices") or [])
        )
        if not valid:
            errors.append(_type_error(name, f"must be a valid {kind or 'input'} value"))
            continue
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if declaration.get("min") is not None and value < declaration["min"]:
                errors.append(_type_error(name, "is below the minimum"))
            if declaration.get("max") is not None and value > declaration["max"]:
                errors.append(_type_error(name, "is above the maximum"))

    secrets = normalized.get("secrets", {})
    if secrets is not None and not isinstance(secrets, Mapping):
        errors.append(_type_error("secrets", "must be an object"))
        secrets = {}
    canonical_secrets: dict[str, dict[str, str]] = {}
    nested_secret_names: set[str] = set()
    if isinstance(secrets, Mapping):
        for name, value in secrets.items():
            name = str(name)
            nested_secret_names.add(name)
            if name not in secret_names:
                errors.append(_type_error(f"secrets.{name}", "is not declared by the service catalog"))
                continue
            reference = _secret_reference(value)
            if reference is None or not isinstance(value, Mapping):
                errors.append(_type_error(f"secrets.{name}", "must be exactly {secret_ref: secret://...}"))
                continue
            canonical_secrets[name] = {"secret_ref": reference}

    # Canonicalize legacy top-level declared secret fields into the same
    # metadata-only shape. This lets nested refs survive while raw values are
    # rejected before provider validation or persistence.
    for name, declaration in secret_declarations.items():
        direct_present = name in normalized
        direct = normalized.pop(name) if direct_present else None
        nested_present = name in nested_secret_names
        if direct_present and nested_present:
            errors.append(_type_error(name, "must be supplied either in spec or spec.secrets, not both"))
            continue
        reference = _secret_reference(direct) if direct_present else None
        if direct_present and reference is None:
            errors.append(_type_error(name, "must be a secret reference (secret://...) or nested secret_ref"))
        elif reference is not None:
            canonical_secrets[name] = {"secret_ref": reference}
        if declaration.get("required", True) and name not in canonical_secrets:
            errors.append(_type_error(name, "secret reference is required"))

    if canonical_secrets:
        normalized["secrets"] = canonical_secrets
    else:
        normalized.pop("secrets", None)
    storage, storage_errors = _validate_storage(manifest, normalized.get("storage"))
    errors.extend(storage_errors)
    if storage:
        normalized["storage"] = storage
    elif "storage" in normalized:
        normalized.pop("storage", None)
    return normalized, errors



def _validated_definition(data: Mapping[str, Any], org_id: str) -> tuple[dict[str, Any] | None, tuple[Any, int] | None]:
    slug, version = _catalog_values(data)
    if not slug or not version:
        return None, error_response(
            "SERVICE_VALIDATION_FAILED", "catalog slug and version are required", 422
        )
    definition = service_catalog.get_definition(slug, version, org_id=org_id)
    if definition is None:
        return None, error_response(
            "SERVICE_VALIDATION_FAILED", "catalog definition not found", 422,
            details={"slug": slug, "version": version},
        )
    return definition, None


def _production_policy_error(manifest: Mapping[str, Any], environment: str):
    """Enforce production readiness at the control-plane boundary.

    ``production_ready`` is a catalog-owned, immutable policy decision.  A
    client checkbox is never treated as approval.  A future approval hook can
    be added through manifest metadata, but an unsafe/unknown policy never
    grants access.
    """
    if environment != "production":
        return None
    if manifest.get("production_ready") is not True:
        return error_response(
            "SERVICE_PRODUCTION_POLICY_REQUIRED",
            "This service definition is not approved for production",
            422,
            details={"policy": "definition.production_ready", "production_ready": False},
        )
    policy = (manifest.get("metadata") or {}).get("production_policy")
    if policy not in {"allow", "approved", "catalog-approved"}:
        return error_response(
            "SERVICE_PRODUCTION_POLICY_REQUIRED",
            "An explicit production policy approval is required",
            422,
            details={"policy": "metadata.production_policy"},
        )
    return None


def _draft_preflight(data: Mapping[str, Any], org_id: str):
    name = str(data.get("name") or "").strip()
    environment = str(data.get("environment") or "").strip()
    runtime_id = str(data.get("runtime_id", data.get("runtimeId")) or "").strip()
    if not _NAME_RE.fullmatch(name):
        return None, None, _manifest_error([{"path": "name", "code": "invalid_name", "message": "valid service name is required"}])
    if not environment or not runtime_id:
        return None, None, _manifest_error([{"path": "environment" if not environment else "runtime_id", "code": "required", "message": "field is required"}])
    policy_error = _production_policy_error((data.get("manifest") or {}), environment)
    definition, error = _validated_definition(data, org_id)
    if error:
        return None, None, error
    manifest = definition["manifest"]
    policy_error = _production_policy_error(manifest, environment)
    if policy_error:
        return None, None, policy_error
    if not _runtime_for_manifest(runtime_id, manifest):
        return None, None, error_response("RUNTIME_UNSUPPORTED", "Runtime is not supported by this catalog service", 422, details={"runtime_id": runtime_id})
    try:
        capabilities = _runtime().capabilities(runtime_id)
    except runtime_registry.ProviderNotFoundError:
        return None, None, error_response("RUNTIME_UNSUPPORTED", "Runtime is not registered", 422, details={"runtime_id": runtime_id})
    if not capabilities.get("deploy", False):
        return None, None, error_response("RUNTIME_UNSUPPORTED", "Runtime does not support deploy", 422, details={"capability": "deploy"})
    spec = data.get("spec", data.get("inputs", {}))
    normalized, errors = _validate_spec(manifest, spec)
    if errors:
        return None, None, _manifest_error(errors)
    normalized.update({"name": name, "environment": environment, "runtime_id": runtime_id, "catalog_slug": definition["slug"], "catalog_version": definition["version"]})
    provider_errors = _provider_validation_errors(runtime_id, normalized)
    if provider_errors:
        return None, None, _manifest_error([{"path": "spec", **item} for item in provider_errors])
    return definition, normalized, None


def _draft_impact(project_id: str, definition: Mapping[str, Any], normalized: Mapping[str, Any]) -> dict[str, Any]:
    manifest = definition.get("manifest") or {}
    operations = service_operations.list_operations(project_id, **_auth_kwargs(project_id))
    resources = dict(manifest.get("minimum_resources") or {})
    if isinstance(normalized.get("memory_mb"), (int, float)):
        resources["memory_mb"] = normalized["memory_mb"]
    storage = normalized.get("storage") or []
    if isinstance(storage, Mapping):
        storage = [storage]
    if storage:
        resources["storage_gb"] = sum(float(item.get("size_gb") or 0) for item in storage if isinstance(item, Mapping))
    secret_names = [str(item.get("name")) for item in manifest.get("secrets", []) if isinstance(item, Mapping) and item.get("name")]
    irreversible = ["Create runtime resources and endpoint"]
    if manifest.get("persistence") in {"required", "optional"}:
        irreversible.append("Persist service data on declared storage")
    if any(bool(item.get("public")) for item in manifest.get("endpoints", []) if isinstance(item, Mapping)):
        irreversible.append("Expose a public service endpoint")
    return {
        "project_id": project_id,
        "environment": normalized.get("environment"),
        "runtime_id": normalized.get("runtime_id"),
        "dependencies": [dict(item) if isinstance(item, Mapping) else item for item in manifest.get("dependencies", [])],
        "active_operations": [_operation_view(project_id, item) for item in operations if item.get("status") in _ACTIVE_OPERATION_STATES],
        "resources": resources,
        "persistence": manifest.get("persistence"),
        "secret_names": secret_names,
        "secrets": secret_names,
        "irreversible_effects": irreversible,
    }


def _instance_view(project_id: str, instance: dict[str, Any], *, detail: bool = False) -> dict[str, Any]:
    result = dict(instance)
    if detail:
        revision = service_instances.get_revision(
            project_id, instance["id"], revision_id=instance.get("desired_revision_id"), **_auth_kwargs(project_id)
        )
        if revision:
            result["revision"] = revision
    return redact_sensitive(result)


def _operation_view(project_id: str, operation: Mapping[str, Any]) -> dict[str, Any]:
    operation_id = str(operation["id"])
    instance_id = operation.get("instance_id")
    suffix = f"/services/{instance_id}" if instance_id else ""
    result = operation.get("provider_result") or {}
    if not isinstance(result, Mapping):
        result = {}
    return redact_sensitive({
        "id": operation_id,
        "kind": operation.get("kind"),
        "status": operation.get("status"),
        "instance_id": instance_id,
        "requested_by": operation.get("requested_by"),
        "error_code": operation.get("error_code"),
        "error_message": operation.get("error_message"),
        "created_at": operation.get("created_at"),
        "started_at": operation.get("started_at"),
        "finished_at": operation.get("finished_at"),
        "result": result,
        "endpoint": result.get("data", {}).get("endpoint") if isinstance(result.get("data"), Mapping) else None,
        "health": result.get("data", {}).get("health") if isinstance(result.get("data"), Mapping) else None,
        "poll_url": f"/api/projects/{project_id}{suffix}/operations/{operation_id}",
        "retryable": operation.get("status") == "failed",
        "timestamps": {"created_at": operation.get("created_at"), "started_at": operation.get("started_at"), "finished_at": operation.get("finished_at")},
    })


def _find_existing_operation(project_id: str, instance_id: str, key: str) -> dict[str, Any] | None:
    from storage import pg
    row = pg.query_one(
        "SELECT * FROM service_operations WHERE project_id = %s AND instance_id = %s AND idempotency_key = %s",
        (project_id, instance_id, key),
    )
    return dict(row) if row else None


def _active_conflict(project_id: str, instance_id: str) -> dict[str, Any] | None:
    rows = service_operations.list_operations(project_id, instance_id=instance_id, limit=50, **_auth_kwargs(project_id))
    return next((row for row in rows if row.get("status") in _ACTIVE_OPERATION_STATES), None)


def _operation_for(project_id: str, instance: Mapping[str, Any], kind: str, *, desired_revision_id: str | None = None):
    key = request.headers.get("Idempotency-Key", "").strip()
    if not key or len(key) > 255:
        return None, error_response("SERVICE_VALIDATION_FAILED", "Idempotency-Key is required", 400)
    existing = _find_existing_operation(project_id, str(instance["id"]), key)
    payload: dict[str, Any] = {"operation": kind, "desired_revision_id": desired_revision_id or instance.get("desired_revision_id")}
    if kind == "destroy":
        payload["confirmed"] = True
    if existing is None:
        conflict = _active_conflict(project_id, str(instance["id"]))
        if conflict:
            return None, error_response(
                "SERVICE_OPERATION_CONFLICT", "Another service operation is already running", 409,
                details={"operation_id": conflict.get("id"), "kind": conflict.get("kind")},
            )
    try:
        operation = service_operations.create_operation(
            project_id, f"service.{kind}", key, payload,
            instance_id=str(instance["id"]), requested_by=_actor_id(),
            **_auth_kwargs(project_id), initial_status="queued",
        )
    except service_operations.OperationConflictError as exc:
        return None, error_response("SERVICE_OPERATION_CONFLICT", str(exc), 409)
    except service_instances.ProjectAuthorizationError:
        return None, error_response("FORBIDDEN", "Project access denied", 403)
    return operation, None


def _load_instance(project_id: str, service_id: str):
    try:
        instance = service_instances.get_instance(project_id, service_id, **_auth_kwargs(project_id))
    except service_instances.ProjectAuthorizationError:
        return None, error_response("FORBIDDEN", "Project access denied", 403)
    if instance is None:
        return None, error_response("SERVICE_NOT_FOUND", "Service instance not found", 404)
    return instance, None


@bp.get("/api/projects/<project_id>/services")
@require_project_access
def list_services(project_id: str):
    org_id, error = _context(project_id)
    if error:
        return error
    instances = service_instances.list_instances(project_id, **_auth_kwargs(project_id))
    return success_response({"services": [_instance_view(project_id, item) for item in instances], "org_id": org_id})


@bp.post("/api/projects/<project_id>/services")
@require_project_access
def create_service(project_id: str):
    data, error = _json_body()
    if error:
        return error
    org_id, error = _context(project_id, data)
    if error:
        return error
    definition, normalized, preflight_error = _draft_preflight(data, org_id)
    if preflight_error:
        return preflight_error
    name = str(normalized["name"])
    environment = str(normalized["environment"])
    runtime_id = str(normalized["runtime_id"])
    try:
        instance = service_instances.create_instance(
            project_id, name, definition["slug"], definition["version"], environment, runtime_id, normalized,
            created_by=_actor_id(), org_id=org_id, **_auth_kwargs(project_id),
        )
    except service_instances.InstanceConflictError as exc:
        return error_response("SERVICE_NAME_CONFLICT", str(exc), 409)
    except service_instances.ServiceInstanceError as exc:
        return error_response("SERVICE_VALIDATION_FAILED", str(exc), 422)
    return success_response({"service": _instance_view(project_id, instance, detail=True)}, status=201)


@bp.get("/api/projects/<project_id>/services/<service_id>")
@require_project_access
def get_service(project_id: str, service_id: str):
    _, error = _context(project_id)
    if error:
        return error
    instance, error = _load_instance(project_id, service_id)
    if error:
        return error
    return success_response({"service": _instance_view(project_id, instance, detail=True)})


@bp.patch("/api/projects/<project_id>/services/<service_id>")
@require_project_access
def patch_service(project_id: str, service_id: str):
    data, error = _json_body()
    if error:
        return error
    _, error = _context(project_id, data)
    if error:
        return error
    instance, error = _load_instance(project_id, service_id)
    if error:
        return error
    if _active_conflict(project_id, service_id):
        return error_response("SERVICE_OPERATION_CONFLICT", "Another service operation is already running", 409)
    definition = service_catalog.get_definition(instance["definition_slug"], instance["definition_version"], org_id=instance["org_id"])
    if definition is None:
        return error_response("SERVICE_VALIDATION_FAILED", "Catalog definition is no longer available", 422)
    policy_error = _production_policy_error(definition["manifest"], str(instance.get("environment") or ""))
    if policy_error:
        return policy_error
    spec = data.get("spec", data.get("inputs"))
    if spec is None:
        return error_response("SERVICE_VALIDATION_FAILED", "spec is required", 422)
    normalized, errors = _validate_spec(definition["manifest"], spec)
    if errors:
        return _manifest_error(errors)
    normalized.update({"name": instance["name"], "environment": instance["environment"], "runtime_id": instance["runtime_id"], "catalog_slug": instance["definition_slug"], "catalog_version": instance["definition_version"]})
    provider_errors = _provider_validation_errors(instance["runtime_id"], normalized)
    if provider_errors:
        return _manifest_error([{"path": "spec", **item} for item in provider_errors])
    try:
        if not definition["manifest"].get("lifecycle", {}).get("update", False) or not _runtime().capabilities(instance["runtime_id"]).get("update", False):
            return error_response("RUNTIME_UNSUPPORTED", "Service or runtime does not support update", 422, details={"capability": "update"})
    except runtime_registry.ProviderNotFoundError:
        return error_response("RUNTIME_UNSUPPORTED", "Runtime is not registered", 422, details={"runtime_id": instance["runtime_id"]})
    idem_key = request.headers.get("Idempotency-Key", "").strip()
    if not idem_key:
        import hashlib
        idem_key = f"patch:{hashlib.sha256(json.dumps(normalized, sort_keys=True, default=str).encode()).hexdigest()}"
    if len(idem_key) > 255:
        return error_response("SERVICE_VALIDATION_FAILED", "Idempotency-Key is too long", 400)
    try:
        revision = service_instances.create_revision(instance["id"], normalized, _actor_id(), project_id=project_id, org_id=instance["org_id"], idempotency_key=idem_key, **_auth_kwargs(project_id))
    except service_instances.RevisionConflictError as exc:
        return error_response("SERVICE_OPERATION_CONFLICT", str(exc), 409)
    except service_instances.ServiceInstanceError as exc:
        return error_response("SERVICE_VALIDATION_FAILED", str(exc), 422)
    updated = service_instances.get_instance(project_id, service_id, **_auth_kwargs(project_id))
    return success_response({"service": _instance_view(project_id, updated, detail=True), "revision": revision})


@bp.post("/api/projects/<project_id>/services/preflight")
@require_project_access
def service_preflight(project_id: str):
    data, error = _json_body()
    if error:
        return error
    org_id, error = _context(project_id, data)
    if error:
        return error
    definition, normalized, preflight_error = _draft_preflight(data, org_id)
    if preflight_error:
        return preflight_error
    return success_response({"impact": _draft_impact(project_id, definition, normalized)})


def _lifecycle(kind: str, project_id: str, service_id: str):
    data = request.get_json(silent=True)
    if data is None:
        data = {}
    if not isinstance(data, dict):
        return error_response("SERVICE_VALIDATION_FAILED", "JSON object required", 422)
    _, error = _context(project_id, data)
    if error:
        return error
    instance, error = _load_instance(project_id, service_id)
    if error:
        return error
    if kind == "destroy":
        confirmed, confirmation_mode = _destroy_confirmation(instance, data)
        if not confirmed and request.headers.get("X-Confirm-Destroy", "").lower() == "true":
            confirmed = False
        if not confirmed:
            has_confirmation = data.get("confirm") is True or data.get("confirmed") is True or bool(request.headers.get("X-Confirm-Destroy"))
            code = "SERVICE_OPERATION_CONFLICT" if has_confirmation else "SERVICE_CONFIRMATION_REQUIRED"
            message = "Destroy confirmation does not match the current service revision" if has_confirmation else "Destroy requires explicit confirmation with target_id and revision_id"
            return error_response(code, message, 409 if has_confirmation else 400, details={"service_id": service_id, "revision_id": instance.get("desired_revision_id")})
    idem_key = request.headers.get("Idempotency-Key", "").strip()
    if not idem_key or len(idem_key) > 255:
        return error_response("SERVICE_VALIDATION_FAILED", "Idempotency-Key is required", 400)
    existing = _find_existing_operation(project_id, service_id, idem_key)
    active = None if existing else _active_conflict(project_id, service_id)
    if active:
        return error_response(
            "SERVICE_OPERATION_CONFLICT", "Another service operation is already running", 409,
            details={"operation_id": active.get("id"), "kind": active.get("kind")},
        )
    definition = service_catalog.get_definition(instance["definition_slug"], instance["definition_version"], org_id=instance["org_id"])
    if definition is None:
        return error_response("SERVICE_VALIDATION_FAILED", "Catalog definition is no longer available", 422)
    desired_revision_id = instance.get("desired_revision_id")
    if kind == "update":
        if not bool(definition["manifest"].get("lifecycle", {}).get("update", False)):
            return error_response("RUNTIME_UNSUPPORTED", "Service does not support update", 422, details={"capability": "update"})
        if not _runtime().capabilities(instance["runtime_id"]).get("update", False):
            return error_response("RUNTIME_UNSUPPORTED", "Runtime does not support update", 422, details={"capability": "update"})
    if kind == "rollback":
        target_id = str(data.get("revision_id") or "").strip()
        if not target_id or target_id == str(desired_revision_id or ""):
            return error_response("SERVICE_VALIDATION_FAILED", "a prior immutable revision_id is required", 422)
        target = service_instances.get_revision(project_id, service_id, revision_id=target_id, **_auth_kwargs(project_id))
        if target is None:
            return error_response("SERVICE_VALIDATION_FAILED", "revision is not part of this service", 404)
        current = service_instances.get_revision(project_id, service_id, revision_id=desired_revision_id, **_auth_kwargs(project_id))
        if current and int(target.get("revision_number") or 0) >= int(current.get("revision_number") or 0):
            return error_response("SERVICE_VALIDATION_FAILED", "rollback must target a prior immutable revision", 422)
        rollback_spec, rollback_errors = _validate_spec(definition["manifest"], target.get("spec") or {})
        if rollback_errors:
            return _manifest_error(rollback_errors)
        rollback_spec.update({"name": instance["name"], "environment": instance["environment"], "runtime_id": instance["runtime_id"], "catalog_slug": instance["definition_slug"], "catalog_version": instance["definition_version"]})
        provider_errors = _provider_validation_errors(instance["runtime_id"], rollback_spec)
        if provider_errors:
            return _manifest_error([{"path": "spec", **item} for item in provider_errors])
        try:
            created_revision = service_instances.create_revision(
                service_id, rollback_spec, _actor_id(), project_id=project_id, org_id=instance["org_id"],
                idempotency_key=f"{idem_key}:revision", **_auth_kwargs(project_id),
            )
        except service_instances.RevisionConflictError as exc:
            return error_response("SERVICE_OPERATION_CONFLICT", str(exc), 409)
        except service_instances.ServiceInstanceError as exc:
            return error_response("SERVICE_VALIDATION_FAILED", str(exc), 422)
        desired_revision_id = created_revision["id"]
        instance, error = _load_instance(project_id, service_id)
        if error:
            return error
    revision = service_instances.get_revision(project_id, service_id, revision_id=instance.get("desired_revision_id"), **_auth_kwargs(project_id))
    if revision is None:
        return error_response("SERVICE_VALIDATION_FAILED", "Service desired revision is unavailable", 422)
    if kind in {"deploy", "update", "rollback"}:
        provider_errors = _provider_validation_errors(instance["runtime_id"], revision.get("spec") or {})
        if provider_errors:
            return _manifest_error([{"path": "spec", **item} for item in provider_errors])
    lifecycle = definition["manifest"].get("lifecycle", {})
    if kind != "deploy" and not bool(lifecycle.get(kind, False)):
        return error_response("RUNTIME_UNSUPPORTED", f"Service does not support {kind}", 422, details={"capability": kind})
    try:
        if not _runtime().capabilities(instance["runtime_id"]).get(kind, False):
            return error_response("RUNTIME_UNSUPPORTED", f"Runtime does not support {kind}", 422, details={"capability": kind})
    except runtime_registry.ProviderNotFoundError:
        return error_response("RUNTIME_UNSUPPORTED", "Runtime is not registered", 422)
    operation, error = _operation_for(project_id, instance, kind, desired_revision_id=(data.get("revision_id") if isinstance(data.get("revision_id"), str) else None))
    if error:
        return error
    return operation_response(_operation_view(project_id, operation), status=202)


for _kind in sorted(_OPERATION_NAMES):
    # Register explicit wrappers so Flask endpoint names and tracebacks remain useful.
    def _make(kind: str):
        @bp.post(
            f"/api/projects/<project_id>/services/<service_id>/operations/{kind}",
            endpoint=f"{kind}_service_operation",
        )
        @require_project_access
        def handler(project_id: str, service_id: str, _kind: str = kind):
            return _lifecycle(_kind, project_id, service_id)
        return handler
    _make(_kind)


@bp.get("/api/projects/<project_id>/services/<service_id>/operations")
@require_project_access
def list_service_operations(project_id: str, service_id: str):
    _, error = _context(project_id)
    if error:
        return error
    _, error = _load_instance(project_id, service_id)
    if error:
        return error
    rows = service_operations.list_operations(project_id, instance_id=service_id, **_auth_kwargs(project_id))
    return success_response({"operations": [_operation_view(project_id, row) for row in rows]})


@bp.get("/api/projects/<project_id>/services/<service_id>/operations/<operation_id>")
@require_project_access
def get_service_operation(project_id: str, service_id: str, operation_id: str):
    _, error = _context(project_id)
    if error:
        return error
    _, error = _load_instance(project_id, service_id)
    if error:
        return error
    operation = service_operations.get_operation(project_id, operation_id, **_auth_kwargs(project_id))
    if not operation or operation.get("instance_id") != service_id:
        return error_response("SERVICE_NOT_FOUND", "Service operation not found", 404)
    return success_response({"operation": _operation_view(project_id, operation)})


@bp.get("/api/projects/<project_id>/services/<service_id>/operations/<operation_id>/events")
@require_project_access
def get_service_operation_events(project_id: str, service_id: str, operation_id: str):
    _, error = _context(project_id)
    if error:
        return error
    _, error = _load_instance(project_id, service_id)
    if error:
        return error
    operation = service_operations.get_operation(project_id, operation_id, **_auth_kwargs(project_id))
    if not operation or operation.get("instance_id") != service_id:
        return error_response("SERVICE_NOT_FOUND", "Service operation not found", 404)
    from services.service_operation_runner import list_events
    try:
        limit = max(1, min(int(request.args.get("limit", 100)), 500))
    except (TypeError, ValueError):
        return error_response("SERVICE_VALIDATION_FAILED", "limit must be an integer", 400)
    return success_response({"operation_id": operation_id, "events": list_events(operation_id, limit=limit)})


@bp.post("/api/projects/<project_id>/services/<service_id>/operations/<operation_id>/cancel")
@require_project_access
def cancel_service_operation(project_id: str, service_id: str, operation_id: str):
    _, error = _context(project_id)
    if error:
        return error
    _, error = _load_instance(project_id, service_id)
    if error:
        return error
    operation = service_operations.get_operation(project_id, operation_id, **_auth_kwargs(project_id))
    if not operation or operation.get("instance_id") != service_id:
        return error_response("SERVICE_NOT_FOUND", "Service operation not found", 404)
    try:
        from services.service_operation_runner import cancel_operation
        canceled = cancel_operation(project_id, operation_id, actor_id=_actor_id())
    except service_operations.OperationConflictError:
        canceled = service_operations.get_operation(project_id, operation_id, **_auth_kwargs(project_id))
    return operation_response(_operation_view(project_id, canceled), status=200)


@bp.get("/api/projects/<project_id>/services/<service_id>/revisions")
@require_project_access
def list_service_revisions(project_id: str, service_id: str):
    _, error = _context(project_id)
    if error:
        return error
    _, error = _load_instance(project_id, service_id)
    if error:
        return error
    return success_response({"revisions": service_instances.list_revisions(project_id, service_id, **_auth_kwargs(project_id))})


@bp.get("/api/projects/<project_id>/services/<service_id>/impact")
@require_project_access
def service_impact(project_id: str, service_id: str):
    _, error = _context(project_id)
    if error:
        return error
    instance, error = _load_instance(project_id, service_id)
    if error:
        return error
    definition = service_catalog.get_definition(instance["definition_slug"], instance["definition_version"], org_id=instance["org_id"])
    operations = service_operations.list_operations(project_id, instance_id=service_id, **_auth_kwargs(project_id))
    manifest = (definition or {}).get("manifest", {})
    revision = service_instances.get_revision(project_id, service_id, revision_id=instance.get("desired_revision_id"), **_auth_kwargs(project_id))
    return success_response({
        "impact": {
            "service_id": service_id,
            "project_id": project_id,
            "revision_id": instance.get("desired_revision_id"),
            "revision_number": (revision or {}).get("revision_number"),
            "confirmation_token": _confirmation_token(instance),
            "environment": instance.get("environment"),
            "status": instance.get("status"),
            "relationships": {"dependencies": manifest.get("dependencies", []), "outputs": manifest.get("outputs", [])},
            "operation_state": [_operation_view(project_id, item) for item in operations if item.get("status") in _ACTIVE_OPERATION_STATES],
        }
    })
