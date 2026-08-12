"""Code registry routes (Fase 6 — UC 382+)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.code_registry import catalog, get_item, install, installed, uninstall
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("code_registry_api", __name__)


def _pid():
    return request.args.get("project_id") or _get_pid_raw(lambda: None)


@bp.route('/api/registry', methods=['GET'])
@require_auth
def api_registry_catalog():
    return jsonify({"items": catalog()})


@bp.route('/api/registry/<name>', methods=['GET'])
@require_auth
def api_registry_item(name):
    it = get_item(name)
    if not it:
        return jsonify({"error": "not found"}), 404
    return jsonify(it)


@bp.route('/api/registry/<name>/install', methods=['POST'])
@require_auth
def api_registry_install(name):
    data = request.get_json(silent=True) or {}
    stack = (data.get("stack") or "").strip()
    if not stack:
        return jsonify({"error": "stack required"}), 400
    try:
        out = install(_pid(), stack, name)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "installed": out}), 201


@bp.route('/api/registry/<name>/uninstall', methods=['POST'])
@require_auth
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
@require_auth
def api_registry_installed():
    stack = (request.args.get("stack") or "").strip()
    if not stack:
        return jsonify({"error": "stack query param required"}), 400
    return jsonify({"installed": installed(_pid(), stack)})