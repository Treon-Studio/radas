"""Service plan/apply-plan routes using the normalized runtime registry."""
from __future__ import annotations
import hashlib, json
from flask import Blueprint, request
from api.platform_contracts import error_response, success_response
from auth.middleware import require_project_access
from services import runtime_registry, service_instances, service_operations

bp = Blueprint("service_plan_api", __name__)

def actor(): return (getattr(request, "current_user", {}) or {}).get("user_id")
def load(project_id, service_id):
    row = service_instances.get_instance(project_id, service_id, actor_id=actor())
    if not row: raise ValueError("service instance not found")
    rev = service_instances.get_revision(project_id, service_id, revision_id=row.get("desired_revision_id"), actor_id=actor())
    if not rev: raise ValueError("desired revision not found")
    return row, rev

def err(exc): return error_response("SERVICE_PLAN_ERROR", str(exc), 422)

@bp.post("/api/projects/<project_id>/services/<service_id>/plan")
@require_project_access
def plan(project_id, service_id):
    try:
        instance, revision = load(project_id, service_id)
        registry = runtime_registry.registry_from_environment()
        result = registry.invoke(instance["runtime_id"], "plan", str(instance["id"]), revision.get("spec") or {})
        return success_response({"plan": result.to_dict()}) if result.success else error_response("RUNTIME_PLAN_FAILED", result.error.get("message", "plan failed"), 422, details=result.error.get("details", {}))
    except Exception as exc: return err(exc)

@bp.post("/api/projects/<project_id>/services/<service_id>/apply-plan")
@require_project_access
def apply_plan(project_id, service_id):
    key = request.headers.get("Idempotency-Key", "").strip(); body = request.get_json(silent=True) or {}
    if not key: return error_response("SERVICE_VALIDATION_FAILED", "Idempotency-Key is required", 400)
    try:
        instance, revision = load(project_id, service_id)
        fingerprint = str(body.get("plan_fingerprint") or "").strip()
        if not fingerprint: return error_response("SERVICE_PLAN_ERROR", "plan_fingerprint is required", 422)
        registry = runtime_registry.registry_from_environment()
        result = registry.invoke(instance["runtime_id"], "apply_plan", str(instance["id"]), revision.get("spec") or {}, fingerprint, idempotency_key=key)
        if not result.success: return error_response("RUNTIME_APPLY_FAILED", result.error.get("message", "apply failed"), 422, details=result.error.get("details", {}))
        op = service_operations.create_operation(project_id, "service.apply_plan", key, {"plan_fingerprint": fingerprint, "desired_revision_id": revision["id"]}, instance_id=service_id, requested_by=actor(), actor_id=actor(), initial_status="queued")
        return success_response({"operation": op, "result": result.to_dict()}, status=202)
    except Exception as exc: return err(exc)
