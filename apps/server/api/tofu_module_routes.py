"""Project-scoped management and protocol routes for private modules."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from uuid import uuid4

from flask import Blueprint, Response, request, send_file

from api.platform_contracts import error_response, register_platform_blueprint_contracts, success_response
from auth.middleware import require_auth
from services import org_service, tofu_module_registry
from storage import pg

bp = Blueprint("tofu_module_api", __name__)
register_platform_blueprint_contracts(bp)


def _user() -> dict:
    return getattr(request, "current_user", {}) or {}


def _project_org(project_id: str):
    row = pg.query_one("SELECT org_id FROM projects WHERE id = %s", (project_id,))
    if not row or not row.get("org_id"):
        return None, error_response("NOT_FOUND", "Project not found", 404)
    if _user().get("user_id") != "__internal__" and not org_service.is_member(row["org_id"], _user().get("user_id")):
        return None, error_response("FORBIDDEN", "Project access denied", 403)
    return row["org_id"], None


def _can_publish(org_id: str) -> bool:
    user_id = _user().get("user_id")
    if user_id == "__internal__":
        return True
    if org_service.member_role(org_id, user_id) in {"owner", "admin"}:
        return True
    return bool(pg.query_one(
        "SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id "
        "JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id "
        "JOIN permissions p ON p.id=rp.permission_id "
        "WHERE u.id=%s AND u.is_active=1 AND p.name IN (%s,%s)",
        (user_id, "module.publish", "module.admin"),
    ))


def _slug(namespace: str, name: str, provider: str) -> str:
    return f"{namespace}/{name}/{provider}"


@bp.post("/api/projects/<project_id>/tofu-modules")
@require_auth
def publish(project_id: str):
    org_id, error = _project_org(project_id)
    if error:
        return error
    if not _can_publish(org_id):
        return error_response("FORBIDDEN", "Module publication is not authorized", 403)
    manifest_raw = request.form.get("manifest")
    archive = request.files.get("archive")
    if not manifest_raw or archive is None:
        return error_response("VALIDATION_ERROR", "manifest and archive are required", 422)
    try:
        manifest = json.loads(manifest_raw)
    except json.JSONDecodeError:
        return error_response("VALIDATION_ERROR", "manifest must be valid JSON", 422)
    if not isinstance(manifest, dict):
        return error_response("VALIDATION_ERROR", "manifest must be an object", 422)
    temp_dir = Path(os.environ.get("DATA_DIR", "data")) / "module-registry" / ".tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp = temp_dir / f"{uuid4()}.tar.gz"
    try:
        archive.save(temp)
        result = tofu_module_registry.publish_module(
            manifest, temp, actor_id=_user().get("user_id") or "system", org_id=org_id
        )
        return success_response({"module": result}, status=201)
    except tofu_module_registry.ModuleConflictError as exc:
        return error_response("CONFLICT", str(exc), 409)
    except tofu_module_registry.ModuleValidationError as exc:
        return error_response("VALIDATION_ERROR", str(exc), 422)
    except tofu_module_registry.ModuleStorageError:
        return error_response("INTERNAL_SERVER_ERROR", "module publication failed", 500)
    finally:
        temp.unlink(missing_ok=True)


@bp.get("/api/projects/<project_id>/tofu-modules")
@require_auth
def list_modules(project_id: str):
    org_id, error = _project_org(project_id)
    if error:
        return error
    return success_response({"modules": tofu_module_registry.list_modules(org_id)})


@bp.get("/api/projects/<project_id>/tofu-modules/<namespace>/<name>/<provider>")
@require_auth
def module_detail(project_id: str, namespace: str, name: str, provider: str):
    org_id, error = _project_org(project_id)
    if error:
        return error
    module = tofu_module_registry.get_module(_slug(namespace, name, provider), org_id=org_id)
    if not module:
        return error_response("NOT_FOUND", "Module not found", 404)
    return success_response({"module": module})


@bp.get("/.well-known/terraform.json")
@require_auth
def discovery():
    project_id = request.headers.get("X-Project-Id")
    if not project_id:
        return error_response("VALIDATION_ERROR", "X-Project-Id is required", 422)
    _, error = _project_org(project_id)
    if error:
        return error
    return Response(json.dumps({"modules.v1": "/v1/modules/"}), mimetype="application/json")


@bp.get("/v1/modules/<namespace>/<name>/<provider>/versions")
@require_auth
def versions(namespace: str, name: str, provider: str):
    project_id = request.headers.get("X-Project-Id")
    if not project_id:
        return error_response("VALIDATION_ERROR", "X-Project-Id is required", 422)
    org_id, error = _project_org(project_id)
    if error:
        return error
    values = tofu_module_registry.versions(_slug(namespace, name, provider), org_id=org_id)
    if not values:
        return error_response("NOT_FOUND", "Module not found", 404)
    return Response(json.dumps({"modules": [{"versions": [{"version": item["version"]} for item in values]}]}), mimetype="application/json")


@bp.get("/v1/modules/<namespace>/<name>/<provider>/<version>/download")
@require_auth
def download(namespace: str, name: str, provider: str, version: str):
    project_id = request.headers.get("X-Project-Id")
    if not project_id:
        return error_response("VALIDATION_ERROR", "X-Project-Id is required", 422)
    org_id, error = _project_org(project_id)
    if error:
        return error
    module = tofu_module_registry.get_module(_slug(namespace, name, provider), version, org_id=org_id)
    if not module:
        return error_response("NOT_FOUND", "Module version not found", 404)
    return Response("", status=302, headers={"X-Terraform-Get": f"/v1/modules/download/{module['id']}/{version}"})


@bp.get("/v1/modules/download/<module_id>/<version>")
@require_auth
def serve_archive(module_id: str, version: str):
    project_id = request.headers.get("X-Project-Id")
    if not project_id:
        return error_response("VALIDATION_ERROR", "X-Project-Id is required", 422)
    org_id, error = _project_org(project_id)
    if error:
        return error
    path = tofu_module_registry.archive_path(module_id, version, org_id=org_id)
    if not path:
        return error_response("NOT_FOUND", "Module archive not found", 404)
    return send_file(path, mimetype="application/gzip", as_attachment=True, download_name=f"module-{version}.tar.gz")
