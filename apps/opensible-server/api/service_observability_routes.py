"""Project-scoped service observability routes."""
from __future__ import annotations

from flask import Blueprint, request

from api.platform_contracts import error_response, success_response
from auth.middleware import require_project_access
from services import service_observability

bp = Blueprint("service_observability_api", __name__)


def _actor():
    return (getattr(request, "current_user", {}) or {}).get("user_id")


def _err(exc: Exception):
    text = str(exc)
    status = 403 if "access denied" in text else 404 if "not found" in text else 422
    return error_response("FORBIDDEN" if status == 403 else "SERVICE_OBSERVABILITY_ERROR", text, status)


@bp.get("/api/projects/<project_id>/services/<service_id>/observability")
@require_project_access
def get_observability(project_id, service_id):
    try:
        return success_response({"health": service_observability.health(project_id, service_id, _actor()), "timeline": service_observability.timeline(project_id, service_id, _actor())})
    except service_observability.ObservabilityError as exc:
        return _err(exc)


@bp.get("/api/projects/<project_id>/services/<service_id>/health")
@require_project_access
def get_health(project_id, service_id):
    try:
        return success_response(service_observability.health(project_id, service_id, _actor()))
    except service_observability.ObservabilityError as exc:
        return _err(exc)


@bp.get("/api/projects/<project_id>/services/<service_id>/logs")
@require_project_access
def get_logs(project_id, service_id):
    try:
        return success_response(service_observability.logs(project_id, service_id, _actor(), request.args.get("limit", 50, type=int), request.args.get("cursor")))
    except service_observability.ObservabilityError as exc:
        return _err(exc)
