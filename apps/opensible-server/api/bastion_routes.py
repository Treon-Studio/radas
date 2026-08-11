"""Bastion routes (Fase 5 — UC 24)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.bastion import delete_bastion, get_bastion, save_bastion

bp = Blueprint("bastion_api", __name__)


@bp.route('/api/bastion/<project_id>', methods=['GET'])
@require_auth
def api_get_bastion(project_id):
    return jsonify({"configured": bool(get_bastion(project_id)), "bastion": get_bastion(project_id)})


@bp.route('/api/bastion/<project_id>', methods=['PUT'])
@require_auth
def api_put_bastion(project_id):
    data = request.get_json(silent=True) or {}
    try:
        cfg = save_bastion(project_id, data.get("host") or "", data.get("user") or "",
                           int(data.get("port") or 22), data.get("ssh_key") or "")
    except (ValueError, TypeError) as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "bastion": cfg})


@bp.route('/api/bastion/<project_id>', methods=['DELETE'])
@require_auth
def api_delete_bastion(project_id):
    if not delete_bastion(project_id):
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True})
