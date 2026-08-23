"""Code registry routes (Fase 6 — UC 382+)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from services.code_registry import catalog, get_item, install, installed, uninstall
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("code_registry_api", __name__)


def _pid():
    return request.args.get("project_id") or _get_pid_raw(lambda: None)


@bp.route('/api/registry', methods=['GET'])
@require_project_access
def api_registry_catalog():
    return jsonify({"items": catalog()})


@bp.route('/api/registry/<name>', methods=['GET'])
@require_project_access
def api_registry_item(name):
    it = get_item(name)
    if not it:
        return jsonify({"error": "not found"}), 404
    return jsonify(it)


@bp.route('/api/registry/<name>/changelog', methods=['GET'])
@require_project_access
def api_registry_changelog(name):
    from services.code_registry import get_item_changelog
    try:
        cl = get_item_changelog(name)
        return jsonify({"success": True, "changelog": cl})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@bp.route('/api/registry/<name>/install', methods=['POST'])
@require_project_access
def api_registry_install(name):
    data = request.get_json(silent=True) or {}
    stack = (data.get("stack") or "").strip()
    version = (data.get("version") or "").strip() or None
    if not stack:
        return jsonify({"error": "stack required"}), 400
    try:
        out = install(_pid(), stack, name, version=version)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "installed": out}), 201


@bp.route('/api/registry/<name>/uninstall', methods=['POST'])
@require_project_access
def api_registry_uninstall(name):
    data = request.get_json(silent=True) or {}
    stack = (data.get("stack") or "").strip()
    if not stack:
        return jsonify({"error": "stack required"}), 400
    try:
        out = uninstall(_pid(), stack, name)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "uninstalled": out})


@bp.route('/api/registry/installed', methods=['GET'])
@require_project_access
def api_registry_installed():
    stack = (request.args.get("stack") or "").strip()
    if not stack:
        return jsonify({"error": "stack query param required"}), 400
    return jsonify({"installed": installed(_pid(), stack)})


@bp.route('/api/registry/<name>/export', methods=['GET'])
@require_project_access
def api_registry_export(name):
    from services.code_registry import export_item_bundle
    try:
        bundle = export_item_bundle(name)
        return jsonify({"success": True, "bundle": bundle})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@bp.route('/api/registry/import', methods=['POST'])
@require_project_access
def api_registry_import():
    from services.code_registry import import_item_bundle
    data = request.get_json(silent=True) or {}
    bundle = data.get("bundle") or data
    try:
        res = import_item_bundle(bundle)
        return jsonify(res), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/registry/publish', methods=['POST'])
@require_project_access
def api_registry_publish():
    from services.code_registry import publish_from_stack
    data = request.get_json(silent=True) or {}
    stack = (data.get("stack") or "").strip()
    name = (data.get("name") or "").strip()
    item_type = (data.get("type") or "tofu-block").strip()
    file_patterns = data.get("file_patterns") or []
    if not stack or not name or not file_patterns:
        return jsonify({"error": "stack, name, and file_patterns are required"}), 400
    try:
        res = publish_from_stack(
            project_id=_pid(),
            stack=stack,
            name=name,
            item_type=item_type,
            file_patterns=file_patterns,
            version=data.get("version", "1.0.0"),
            description=data.get("description", ""),
            tags=data.get("tags"),
            dependencies=data.get("dependencies"),
        )
        return jsonify(res), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/registry/stacks/<stack>/items/<name>/diff', methods=['GET'])
@require_project_access
def api_registry_diff(stack, name):
    from services.code_registry import diff_installed_item
    target_version = request.args.get("version")
    try:
        res = diff_installed_item(_pid(), stack, name, target_version=target_version)
        return jsonify({"success": True, "diff": res})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/registry/stacks/<stack>/items/<name>/update', methods=['POST'])
@require_project_access
def api_registry_update(stack, name):
    from services.code_registry import update_installed_item
    data = request.get_json(silent=True) or {}
    version = data.get("version")
    try:
        res = update_installed_item(_pid(), stack, name, version=version)
        return jsonify(res)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400