"""Service revision change request review routes."""
from __future__ import annotations
from flask import Blueprint, request
from api.platform_contracts import error_response, success_response
from auth.middleware import require_project_access
from services import service_change_requests
bp=Blueprint("service_change_request_api",__name__)
def actor(): return (getattr(request,"current_user",{}) or {}).get("user_id")
def err(exc): return error_response("SERVICE_CHANGE_ERROR",str(exc),403 if "access denied" in str(exc) else 404 if "not found" in str(exc) else 422)
@bp.get("/api/projects/<project_id>/services/<service_id>/changes")
@require_project_access
def list_changes(project_id,service_id):
    try:
        service_change_requests._instance(project_id,service_id,actor()); from storage import pg
        return success_response({"changes":pg.query_all("SELECT * FROM service_change_requests WHERE project_id=%s AND instance_id=%s ORDER BY created_at DESC",(project_id,service_id))})
    except service_change_requests.ChangeRequestError as exc:return err(exc)
@bp.post("/api/projects/<project_id>/services/<service_id>/changes")
@require_project_access
def create_change(project_id,service_id):
    try:return success_response({"change":service_change_requests.create(project_id,service_id,actor(),(request.get_json(silent=True) or {}).get("spec") or {})},status=201)
    except service_change_requests.ChangeRequestError as exc:return err(exc)
@bp.post("/api/projects/<project_id>/services/<service_id>/changes/<change_id>/<decision>")
@require_project_access
def decide_change(project_id,service_id,change_id,decision):
    if decision not in {"approve","reject","cancel"}: return error_response("BAD_REQUEST","invalid decision",400)
    try:return success_response({"change":service_change_requests.decide(project_id,service_id,change_id,actor(),{"approve":"approved","reject":"rejected","cancel":"canceled"}[decision],(request.get_json(silent=True) or {}).get("note", ""))})
    except service_change_requests.ChangeRequestError as exc:return err(exc)
