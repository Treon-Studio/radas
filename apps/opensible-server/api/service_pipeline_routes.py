"""Project-scoped service pipeline and promotion routes."""
from __future__ import annotations

from flask import Blueprint, request

from api.platform_contracts import error_response, success_response
from auth.middleware import require_project_access
from services import service_pipeline

bp = Blueprint("service_pipeline_api", __name__)


def _actor() -> str | None:
    return (getattr(request, "current_user", {}) or {}).get("user_id")


def _err(exc: Exception):
    text = str(exc)
    status = 403 if "access denied" in text else 404 if "not found" in text else 422
    return error_response("FORBIDDEN" if status == 403 else "SERVICE_PIPELINE_ERROR", text, status)


@bp.get("/api/projects/<project_id>/services/<service_id>/pipeline")
@require_project_access
def get_pipeline(project_id: str, service_id: str):
    try:
        pipeline = service_pipeline.get(project_id, service_id, _actor())
        runs = []
        if pipeline:
            from storage import pg
            runs = [dict(row) for row in pg.query_all("SELECT * FROM service_pipeline_runs WHERE pipeline_id=%s ORDER BY created_at DESC", (pipeline["id"],))]
        return success_response({"pipeline": pipeline, "runs": runs})
    except service_pipeline.PipelineError as exc:
        return _err(exc)


@bp.put("/api/projects/<project_id>/services/<service_id>/pipeline")
@require_project_access
def put_pipeline(project_id: str, service_id: str):
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return error_response("BAD_REQUEST", "JSON object required", 400)
    try:
        return success_response({"pipeline": service_pipeline.upsert(project_id, service_id, _actor(), body)})
    except service_pipeline.PipelineError as exc:
        return _err(exc)


@bp.post("/api/projects/<project_id>/services/<service_id>/pipeline/run")
@require_project_access
def run_pipeline(project_id: str, service_id: str):
    body = request.get_json(silent=True) or {}
    key = request.headers.get("Idempotency-Key", "").strip()
    try:
        result = service_pipeline.run(project_id, service_id, _actor(), key, str(body.get("target_environment") or "staging"))
        return success_response({"run": result}, status=202)
    except service_pipeline.PipelineError as exc:
        return _err(exc)


@bp.post("/api/projects/<project_id>/services/<service_id>/pipeline/<run_id>/approve")
@require_project_access
def approve_pipeline(project_id: str, service_id: str, run_id: str):
    try:
        return success_response({"run": service_pipeline.approve(project_id, service_id, _actor() or "", run_id)})
    except service_pipeline.PipelineError as exc:
        return _err(exc)


@bp.post("/api/projects/<project_id>/services/<service_id>/pipeline/<run_id>/promote")
@require_project_access
def promote_pipeline(project_id: str, service_id: str, run_id: str):
    body = request.get_json(silent=True) or {}
    try:
        return success_response({"run": service_pipeline.promote(project_id, service_id, _actor() or "", run_id, str(body.get("target_environment") or "production"))})
    except service_pipeline.PipelineError as exc:
        return _err(exc)
