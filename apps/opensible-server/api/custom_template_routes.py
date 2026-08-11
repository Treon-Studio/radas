"""Custom template routes (Fase 5 — UC 15/96)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.custom_templates import import_template, list_templates

bp = Blueprint("custom_template_api", __name__)


@bp.route('/api/templates/custom', methods=['GET'])
@require_auth
def api_list_custom_templates():
    return jsonify({"templates": list_templates()})


@bp.route('/api/templates/import', methods=['POST'])
@require_auth
def api_import_template():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    git_url = (data.get("git_url") or "").strip()
    if not name or not git_url:
        return jsonify({"error": "name and git_url required"}), 400
    try:
        tpl = import_template(name, git_url)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "template": tpl}), 201
