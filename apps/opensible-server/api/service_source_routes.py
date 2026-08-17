"""Service-specific Git source binding and deploy-from-commit routes."""
from __future__ import annotations

from flask import Blueprint, request

from api.platform_contracts import error_response, operation_response, success_response
from auth.middleware import require_project_access
from services import service_operations, service_source

bp = Blueprint("service_source_api", __name__)


def _actor() -> str | None:
    return (getattr(request, "current_user", {}) or {}).get("user_id")


def _error(exc: Exception):
    text = str(exc)
    status = 403 if "access denied" in text else 404 if "not found" in text else 422
    return error_response("FORBIDDEN" if status == 403 else "SERVICE_SOURCE_ERROR", text, status)


@bp.get("/api/projects/<project_id>/services/<service_id>/source")
@require_project_access
def get_source(project_id: str, service_id: str):
    try:
        return success_response({"source": service_source.get(project_id, service_id, _actor())})
    except service_source.ServiceSourceError as exc:
        return _error(exc)


@bp.put("/api/projects/<project_id>/services/<service_id>/source")
@require_project_access
def bind_source(project_id: str, service_id: str):
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return error_response("BAD_REQUEST", "JSON object required", 400)
    try:
        return success_response({"source": service_source.bind(project_id, service_id, _actor(), body)})
    except service_source.ServiceSourceError as exc:
        return _error(exc)


@bp.post("/api/projects/<project_id>/services/<service_id>/source/resolve")
@require_project_access
def resolve_source(project_id: str, service_id: str):
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return error_response("BAD_REQUEST", "JSON object required", 400)
    try:
        source = service_source.resolve_commit(project_id, service_id, _actor(), body.get("commit_sha"))
        return success_response({"source": source})
    except service_source.ServiceSourceError as exc:
        return _error(exc)


@bp.post("/api/projects/<project_id>/services/<service_id>/source/deploy")
@require_project_access
def deploy_source(project_id: str, service_id: str):
    key = request.headers.get("Idempotency-Key", "").strip()
    if not key:
        return error_response("SERVICE_VALIDATION_FAILED", "Idempotency-Key is required", 400)
    try:
        source = service_source.get(project_id, service_id, _actor())
        if not source or not source.get("commit_sha"):
            return error_response("SERVICE_SOURCE_ERROR", "A resolved commit is required", 422)
        operation = service_operations.create_source_deploy_operation(
            project_id, service_id, source, key, requested_by=_actor(), actor_id=_actor()
        )
        operation["poll_url"] = f"/api/projects/{project_id}/services/{service_id}/operations/{operation['id']}"
        return operation_response(operation, status=202)
    except service_source.ServiceSourceError as exc:
        return _error(exc)
    except service_operations.OperationConflictError as exc:
        return error_response("SERVICE_OPERATION_CONFLICT", str(exc), 409)
