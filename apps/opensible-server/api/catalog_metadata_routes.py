"""Catalog deprecation and security review metadata."""
from __future__ import annotations
import time
from flask import Blueprint, request
from api.platform_contracts import error_response, success_response
from auth.middleware import require_auth
from services import service_catalog
from storage import pg
bp=Blueprint("catalog_metadata_api",__name__)
def actor():return (getattr(request,"current_user",{}) or {}).get("user_id")
def can_admin():return actor()=="__internal__" or bool(pg.query_one("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s AND r.name='admin'",(actor(),)))
@bp.post("/api/platform/catalog/<slug>/<version>/deprecate")
@require_auth
def deprecate(slug,version):
 if not can_admin():return error_response("FORBIDDEN","Catalog deprecation requires admin",403)
 reason=str((request.get_json(silent=True) or {}).get("reason") or "").strip()
 if not reason:return error_response("VALIDATION_ERROR","reason is required",422)
 row=pg.query_one("UPDATE service_definitions d SET deprecated_at=%s,deprecation_reason=%s WHERE d.slug=%s AND d.current_version=%s RETURNING d.id,d.slug,d.deprecated_at,d.deprecation_reason",(time.time(),reason,slug,version))
 if not row:return error_response("NOT_FOUND","Service definition not found",404)
 return success_response({"definition":dict(row)})
