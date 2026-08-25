"""Canonical project environment records for the developer workspace."""
from __future__ import annotations

from flask import Blueprint, request

from api.platform_contracts import error_response, success_response
from auth.middleware import require_project_access
from services import environment_service

bp = Blueprint("environment_api", __name__)


def _auth(project_id: str) -> dict[str, str | None]:
    current = getattr(request, "current_user", {}) or {}
    return {"actor_id": current.get("user_id"), "org_id": current.get("org_id")}


def _project_org(project_id: str) -> str:
    from storage import pg
    row = pg.query_one("SELECT org_id FROM projects WHERE id=%s", (project_id,))
    if not row or not row.get("org_id"):
        raise environment_service.EnvironmentError("project not found")
    return str(row["org_id"])


@bp.route("/api/projects/<project_id>/environments", methods=["GET"])
@require_project_access
def list_environments(project_id: str):
    try:
        org_id = _project_org(project_id)
        return success_response({"environments": environment_service.list_environments(project_id, org_id)})
    except environment_service.EnvironmentError as exc:
        return error_response("PROJECT_NOT_FOUND", str(exc), 404)


@bp.route("/api/projects/<project_id>/environments/<name>", methods=["GET"])
@require_project_access
def get_environment(project_id: str, name: str):
    try:
        org_id = _project_org(project_id)
        result = environment_service.get_environment(project_id, org_id, name)
        if result is None:
            return error_response("ENVIRONMENT_NOT_FOUND", "Environment not found", 404)
        return success_response({"environment": result})
    except environment_service.EnvironmentError as exc:
        return error_response("INVALID_ENVIRONMENT", str(exc), 400)


@bp.route("/api/projects/<project_id>/environments/<name>", methods=["PATCH"])
@require_project_access
def update_environment(project_id: str, name: str):
    try:
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return error_response("BAD_REQUEST", "JSON object required", 400)
        org_id = _project_org(project_id)
        variables = body.get("variables")
        if variables is not None and not isinstance(variables, dict):
            return error_response("VALIDATION_ERROR", "variables must be an object", 422)
        before = environment_service.get_environment(project_id, org_id, name)
        result = environment_service.update_environment(
            project_id,
            org_id,
            name,
            protected=body.get("protected"),
            variables=variables,
        )
        diff = environment_service.overlay_diff(
            (before or {}).get("variables"), result.get("variables")
        )
        return success_response({"environment": result, "variable_diff": diff})
    except environment_service.EnvironmentError as exc:
        status = 404 if str(exc) == "environment not found" else 400
        return error_response("ENVIRONMENT_NOT_FOUND" if status == 404 else "INVALID_ENVIRONMENT", str(exc), status)
