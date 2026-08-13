"""Quota CRUD routes (Fase 2 — UC 69)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from services.quota_service import (
    check_quota, delete_quota, get_quota, save_quota, stack_usage,
)

bp = Blueprint("quota_api", __name__)


@bp.route('/api/quota/<project_id>', methods=['GET'])
@require_project_access
def api_get_quota(project_id):
    q = get_quota(project_id)
    usage = stack_usage(project_id)
    if not q:
        return jsonify({"configured": False, "usage": {"stacks": usage}})
    q = dict(q)
    q["usage"] = {"stacks": usage}
    return jsonify({"configured": True, "quota": q})


@bp.route('/api/quota/<project_id>', methods=['PUT'])
@require_project_access
def api_put_quota(project_id):
    data = request.get_json(silent=True) or {}
    try:
        q = save_quota(project_id,
                       int(data.get("max_stacks") or 0),
                       int(data.get("max_vms") or 0),
                       float(data.get("max_cost_monthly") or 0))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid quota", "message": "limits must be numbers"}), 400
    q["usage"] = {"stacks": stack_usage(project_id)}
    return jsonify({"success": True, "quota": q})


@bp.route('/api/quota/<project_id>', methods=['DELETE'])
@require_project_access
def api_delete_quota(project_id):
    if not delete_quota(project_id):
        return jsonify({"error": "not found", "message": "no quota configured"}), 404
    return jsonify({"success": True})


@bp.route('/api/quota/<project_id>/check', methods=['POST'])
@require_project_access
def api_check_quota(project_id):
    return jsonify(check_quota(project_id, request.args.get("kind") or "stacks"))
