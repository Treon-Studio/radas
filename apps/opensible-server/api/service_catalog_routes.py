"""Authenticated versioned service catalog API."""
from __future__ import annotations

from typing import Any

from flask import Blueprint, request

from api.platform_contracts import (
    error_response,
    register_platform_blueprint_contracts,
    success_response,
)
from auth.middleware import require_auth
from services import service_catalog
from services.org_service import is_member, member_role

bp = Blueprint("service_catalog_api", __name__)
register_platform_blueprint_contracts(bp)


def _user() -> dict[str, Any]:
    return getattr(request, "current_user", {}) or {}


def _is_global_admin() -> bool:
    user = _user()
    return user.get("user_id") == "__internal__" or "admin" in (user.get("roles") or [])


def _requested_org(data: dict[str, Any] | None = None) -> str | None:
    data = data or {}
    values = [data.get("org_id"), request.args.get("org_id"), request.headers.get("X-Org-Id")]
    present = {str(value).strip() for value in values if value is not None and str(value).strip()}
    if len(present) > 1:
        raise ValueError("conflicting organization identifiers")
    return next(iter(present), None)


def _authorized_org(org_id: str | None) -> bool:
    if not org_id:
        return True
    user_id = _user().get("user_id")
    return bool(user_id == "__internal__" or (user_id and is_member(org_id, user_id)))


def _can_publish(scope: str, org_id: str | None) -> bool:
    if scope in {"platform", "global"}:
        return _is_global_admin()
    user = _user()
    if _is_global_admin():
        return True
    return bool(org_id and user.get("user_id") and member_role(org_id, user["user_id"]) in {"owner", "admin"})


def _json_object() -> tuple[dict[str, Any] | None, tuple[Any, int] | None]:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, (error_response("VALIDATION_ERROR", "JSON object required", 422))
    return data, None


@bp.get("/api/platform/catalog")
@require_auth
def list_catalog():
    try:
        org_id = _requested_org()
    except ValueError as exc:
        return error_response("VALIDATION_ERROR", str(exc), 422)
    if org_id and not _authorized_org(org_id):
        return error_response("FORBIDDEN", "Organization access denied", 403)
    definitions = service_catalog.list_definitions(org_id, include_disabled=_is_global_admin() and request.args.get("include_disabled") == "true")
    return success_response({"definitions": definitions})


@bp.get("/api/platform/catalog/<slug>")
@require_auth
def get_catalog(slug: str):
    try:
        org_id = _requested_org()
    except ValueError as exc:
        return error_response("VALIDATION_ERROR", str(exc), 422)
    if org_id and not _authorized_org(org_id):
        return error_response("FORBIDDEN", "Organization access denied", 403)
    definition = service_catalog.get_definition(slug, request.args.get("version"), org_id=org_id, include_disabled=_is_global_admin())
    if definition is None:
        return error_response("NOT_FOUND", "Service definition not found", 404)
    return success_response({"definition": definition})


@bp.post("/api/platform/catalog")
@require_auth
def publish_catalog():
    data, error = _json_object()
    if error:
        return error
    manifest = data.get("manifest", data)
    scope = str(data.get("scope", "platform" if not data.get("org_id") else "organization")).lower()
    try:
        org_id = _requested_org(data)
    except ValueError as exc:
        return error_response("VALIDATION_ERROR", str(exc), 422)
    if scope in {"global", "platform"}:
        org_id = None
    if scope not in {"global", "platform", "organization", "org", "private"}:
        return error_response("VALIDATION_ERROR", "scope must be platform or organization", 422)
    if not _can_publish(scope, org_id):
        return error_response("FORBIDDEN", "Catalog publication is not authorized", 403)
    errors = service_catalog.validate_manifest(manifest)
    if errors:
        return error_response("VALIDATION_ERROR", "Service definition manifest is invalid", 422, details={"errors": errors})
    try:
        published = service_catalog.publish_definition(
            manifest, _user(), org_id, scope="platform" if scope in {"global", "platform"} else "organization"
        )
    except service_catalog.CatalogConflictError as exc:
        return error_response("CONFLICT", str(exc), 409)
    except service_catalog.CatalogValidationError as exc:
        return error_response("VALIDATION_ERROR", "Service definition manifest is invalid", 422, details={"errors": exc.errors})
    except ValueError as exc:
        return error_response("VALIDATION_ERROR", str(exc), 422)
    return success_response({"definition": published}, status=201)
