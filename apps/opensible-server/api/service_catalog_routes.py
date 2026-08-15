"""Authenticated, versioned service catalog API.

The platform path exposes only globally published definitions. Organization
catalog entries are exposed through an authorized project context (the legacy
org selector remains supported only as an explicitly membership-checked
compatibility path; it never grants access by itself).
"""
from __future__ import annotations

from typing import Any

from flask import Blueprint, request

from api.platform_contracts import error_response, register_platform_blueprint_contracts, success_response
from auth.middleware import require_auth, get_access_control_service
from services import service_catalog
from services.org_service import is_member, member_role
from storage import pg

bp = Blueprint("service_catalog_api", __name__)
register_platform_blueprint_contracts(bp)


def _user() -> dict[str, Any]:
    return getattr(request, "current_user", {}) or {}


def _is_global_admin() -> bool:
    """Use repository-authoritative RBAC, not mutable JWT role claims."""
    user_id = _user().get("user_id")
    if user_id == "__internal__":
        return True
    if not user_id:
        return False
    try:
        access_control = get_access_control_service()
        if access_control.has_permission(user_id, "catalog.admin") or access_control.has_permission(user_id, "service_catalog.admin"):
            return True
        # The PostgreSQL RBAC tables are authoritative for this API. This also
        # supports installations whose file-backed role service is stale.
        row = pg.query_one(
            "SELECT 1 AS allowed FROM users u JOIN user_roles ur ON ur.user_id = u.id "
            "JOIN roles r ON r.id = ur.role_id WHERE u.id = %s AND u.is_active = 1 AND r.name = %s",
            (user_id, "admin"),
        )
        return bool(row)
    except Exception:
        return False


def _requested_org(data: dict[str, Any] | None = None) -> str | None:
    """Reject client-selected organization context.

    Organization scope is derived from an authorized project. The old
    ``org_id`` selectors are intentionally not accepted on catalog routes.
    """
    data = data or {}
    if request.headers.get("X-Org-Id"):
        raise ValueError("organization must be derived from an authorized project")
    values = [data.get("org_id"), request.args.get("org_id")]
    present = {str(value).strip() for value in values if value is not None and str(value).strip()}
    if len(present) > 1:
        raise ValueError("conflicting organization identifiers")
    return next(iter(present), None)


def _authorized_org(org_id: str | None) -> bool:
    if not org_id:
        return True
    user_id = _user().get("user_id")
    return bool(user_id == "__internal__" or (user_id and is_member(org_id, user_id)))


def _project_org(project_id: str) -> tuple[str | None, tuple[Any, int] | None]:
    org_id = service_catalog.project_org_id(project_id)
    if not org_id:
        # Do not disclose whether an arbitrary project id exists without an org.
        return None, error_response("NOT_FOUND", "Project not found", 404)
    if not _authorized_org(org_id):
        return None, error_response("FORBIDDEN", "Project access denied", 403)
    return org_id, None


def _context(project_id: str | None, data: dict[str, Any] | None = None) -> tuple[str | None, tuple[Any, int] | None]:
    try:
        requested = _requested_org(data)
    except ValueError as exc:
        return None, error_response("VALIDATION_ERROR", str(exc), 422)
    if project_id:
        org_id, error = _project_org(project_id)
        if error:
            return None, error
        if requested and requested != org_id:
            return None, error_response("FORBIDDEN", "Organization does not own this project", 403)
        return org_id, None
    if requested and not _authorized_org(requested):
        return None, error_response("FORBIDDEN", "Organization access denied", 403)
    return requested, None


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
        return None, error_response("VALIDATION_ERROR", "JSON object required", 422)
    return data, None


def _list(project_id: str | None = None):
    if not project_id and (request.args.get("org_id") or request.headers.get("X-Org-Id")):
        return error_response("VALIDATION_ERROR", "organization must be derived from an authorized project", 422)
    org_id, error = _context(project_id)
    if error:
        return error
    include_disabled = _is_global_admin() and request.args.get("include_disabled") == "true"
    return success_response({"definitions": service_catalog.list_definitions(org_id, include_disabled=include_disabled)})


def _detail(slug: str, project_id: str | None = None):
    if not project_id and (request.args.get("org_id") or request.headers.get("X-Org-Id")):
        return error_response("VALIDATION_ERROR", "organization must be derived from an authorized project", 422)
    org_id, error = _context(project_id)
    if error:
        return error
    definition = service_catalog.get_definition(
        slug,
        request.args.get("version"),
        org_id=org_id,
        include_disabled=_is_global_admin() and request.args.get("include_disabled") == "true",
    )
    if definition is None:
        return error_response("NOT_FOUND", "Service definition not found", 404)
    return success_response({"definition": definition})


@bp.get("/api/platform/catalog")
@require_auth
def list_catalog():
    return _list()


@bp.get("/api/platform/catalog/<slug>")
@require_auth
def get_catalog(slug: str):
    return _detail(slug)


@bp.get("/api/projects/<project_id>/catalog")
@require_auth
def list_project_catalog(project_id: str):
    return _list(project_id)


@bp.get("/api/projects/<project_id>/catalog/<slug>")
@require_auth
def get_project_catalog(project_id: str, slug: str):
    return _detail(slug, project_id)


@bp.post("/api/platform/catalog")
@require_auth
def publish_catalog():
    data, error = _json_object()
    if error:
        return error
    manifest = data.get("manifest", data)
    scope = str(data.get("scope", "platform")).lower()
    if scope in {"organization", "org", "private"} or data.get("org_id"):
        return error_response("VALIDATION_ERROR", "organization definitions require an authorized project route", 422)
    if scope not in {"global", "platform"}:
        return error_response("VALIDATION_ERROR", "scope must be platform or organization", 422)
    if not _can_publish(scope, None):
        return error_response("FORBIDDEN", "Catalog publication is not authorized", 403)
    return _publish(manifest, None, "platform")


@bp.post("/api/projects/<project_id>/catalog")
@require_auth
def publish_project_catalog(project_id: str):
    data, error = _json_object()
    if error:
        return error
    org_id, error = _context(project_id, data)
    if error:
        return error
    scope = str(data.get("scope", "organization")).lower()
    if scope not in {"organization", "org", "private"}:
        return error_response("VALIDATION_ERROR", "project catalog publication must be organization scoped", 422)
    if not _can_publish(scope, org_id):
        return error_response("FORBIDDEN", "Catalog publication is not authorized", 403)
    return _publish(data.get("manifest", data), org_id, "organization")


def _publish(manifest: Any, org_id: str | None, scope: str):
    errors = service_catalog.validate_manifest(manifest)
    if errors:
        return error_response("VALIDATION_ERROR", "Service definition manifest is invalid", 422, details={"errors": errors})
    try:
        published = service_catalog.publish_definition(manifest, _user(), org_id, scope=scope)
    except service_catalog.CatalogConflictError as exc:
        return error_response("CONFLICT", str(exc), 409)
    except service_catalog.CatalogValidationError as exc:
        return error_response("VALIDATION_ERROR", "Service definition manifest is invalid", 422, details={"errors": exc.errors})
    except ValueError as exc:
        return error_response("VALIDATION_ERROR", str(exc), 422)
    return success_response({"definition": published}, status=201)
