"""Tenant-scoped project operational dashboard route."""
from __future__ import annotations

from flask import Blueprint

from api.platform_contracts import error_response, success_response
from auth.middleware import require_project_access
from services import project_dashboard

bp = Blueprint("project_dashboard_api", __name__)


@bp.get("/api/projects/<project_id>/dashboard")
@require_project_access
def get_project_dashboard(project_id: str):
    try:
        return success_response(project_dashboard.build_dashboard(project_id))
    except ValueError:
        return error_response("PROJECT_NOT_FOUND", "Project not found", 404)
