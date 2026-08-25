"""Role-per-environment routes (Fase 5 — UC 67)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from services.env_roles import get_for_project, save_for_project

bp = Blueprint("env_roles_api", __name__)


@bp.route('/api/env-roles/<project_id>', methods=['GET'])
@require_project_access
def api_get_env_roles(project_id):
    return jsonify({"env_roles": get_for_project(project_id)})


@bp.route('/api/env-roles/<project_id>', methods=['PUT'])
@require_project_access
def api_put_env_roles(project_id):
    data = request.get_json(silent=True) or {}
    mapping = data.get("env_roles") or {}
    return jsonify({"success": True, "env_roles": save_for_project(project_id, mapping)})
