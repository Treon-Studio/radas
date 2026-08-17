"""Organization-scoped runtime connection management."""
from __future__ import annotations
from flask import Blueprint, request
from api.platform_contracts import error_response, success_response
from auth.middleware import require_auth
from services import runtime_connections

bp = Blueprint("runtime_connection_api", __name__)

def actor(): return (getattr(request, "current_user", {}) or {}).get("user_id")
def err(exc):
    status = 403 if "access denied" in str(exc) else 404 if "not found" in str(exc) else 422
    return error_response("FORBIDDEN" if status == 403 else "RUNTIME_CONNECTION_ERROR", str(exc), status)

@bp.get("/api/orgs/<org_id>/runtime-connections")
@require_auth
def list_connections(org_id):
    try: return success_response({"connections": runtime_connections.list_connections(org_id, actor())})
    except runtime_connections.RuntimeConnectionError as exc: return err(exc)

@bp.post("/api/orgs/<org_id>/runtime-connections")
@require_auth
def create_connection(org_id):
    try: return success_response({"connection": runtime_connections.create(org_id, actor(), request.get_json(silent=True) or {})}, status=201)
    except runtime_connections.RuntimeConnectionError as exc: return err(exc)

@bp.post("/api/orgs/<org_id>/runtime-connections/<connection_id>/test")
@require_auth
def test_connection(org_id, connection_id):
    try: return success_response({"connection": runtime_connections.test_connection(org_id, connection_id, actor())})
    except runtime_connections.RuntimeConnectionError as exc: return err(exc)

@bp.post("/api/orgs/<org_id>/runtime-connections/<connection_id>/rotate")
@require_auth
def rotate_connection(org_id, connection_id):
    try: return success_response({"connection": runtime_connections.rotate(org_id, connection_id, actor(), (request.get_json(silent=True) or {}).get("secret_id"))})
    except runtime_connections.RuntimeConnectionError as exc: return err(exc)
