"""Usage snapshots, rollups, exports, and service quota checks."""
from __future__ import annotations

from flask import Blueprint, request

from api.platform_contracts import error_response, success_response
from auth.middleware import require_auth, require_project_access
from services import quota_service, usage_service

bp = Blueprint("usage_api", __name__)


def _actor(): return (getattr(request, "current_user", {}) or {}).get("user_id")

def _err(exc):
    text = str(exc); status = 403 if "access" in text else 404 if "not found" in text else 422
    return error_response("FORBIDDEN" if status == 403 else "USAGE_ERROR", text, status)

@bp.get("/api/projects/<project_id>/usage")
@require_project_access
def project_usage(project_id):
    try: return success_response(usage_service.project(project_id, _actor()))
    except usage_service.UsageError as exc: return _err(exc)

@bp.get("/api/projects/<project_id>/usage/export")
@require_project_access
def project_export(project_id):
    try: return success_response({"rows": usage_service.export(project_id, _actor())})
    except usage_service.UsageError as exc: return _err(exc)

@bp.get("/api/orgs/<org_id>/usage")
@require_auth
def org_usage(org_id):
    try: return success_response(usage_service.organization(org_id, _actor()))
    except usage_service.UsageError as exc: return _err(exc)

@bp.post("/api/projects/<project_id>/services/<service_id>/usage")
@require_project_access
def record_usage(project_id, service_id):
    try: return success_response({"snapshot": usage_service.record(project_id, service_id, _actor(), request.get_json(silent=True) or {})}, status=201)
    except usage_service.UsageError as exc: return _err(exc)

@bp.post("/api/projects/<project_id>/services/<service_id>/quota/check")
@require_project_access
def check_service_quota(project_id, service_id):
    try:
        body = request.get_json(silent=True) or {}
        result = quota_service.check_service_quota(project_id, body.get("resources") or {})
        return success_response(result) if result.get("allowed") else error_response(result["code"], result["reason"], 409, details=result)
    except Exception as exc: return _err(exc)



@bp.get("/api/projects/<project_id>/usage/export/csv")
@bp.get("/api/usage/export/csv")
@require_project_access
def project_usage_export_csv(project_id: str = "default"):
    from flask import Response
    csv_text = usage_service.export_cost_usage_csv(project_id=project_id)
    return Response(
        csv_text,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=usage-{project_id}.csv"},
    )

