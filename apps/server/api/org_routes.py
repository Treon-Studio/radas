"""Organization routes (Fase 7 — D1). Multi-tenant org management."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.org_service import (
    add_member, create_org, get_org, is_member, list_members, list_orgs_for_user,
    member_role, remove_member, set_member_role,
)

bp = Blueprint("org_api", __name__)


def _uid():
    return (getattr(request, "current_user", {}) or {}).get("user_id") or ""


def _require_org_owner(org_id: str) -> bool:
    role = member_role(org_id, _uid())
    return role in ("owner", "admin")


@bp.route('/api/orgs', methods=['GET'])
@require_auth
def api_list_orgs():
    return jsonify({"orgs": list_orgs_for_user(_uid())})


@bp.route('/api/orgs', methods=['POST'])
@require_auth
def api_create_org():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    org = create_org(name, _uid())
    return jsonify({"success": True, "org": org}), 201


@bp.route('/api/orgs/<org_id>', methods=['GET'])
@require_auth
def api_get_org(org_id):
    if not is_member(org_id, _uid()):
        return jsonify({"error": "not a member"}), 403
    org = get_org(org_id)
    if not org:
        return jsonify({"error": "not found"}), 404
    return jsonify(org)


@bp.route('/api/orgs/<org_id>/members', methods=['GET'])
@require_auth
def api_list_members(org_id):
    if not is_member(org_id, _uid()):
        return jsonify({"error": "not a member"}), 403
    return jsonify({"members": list_members(org_id)})


@bp.route('/api/orgs/<org_id>/members', methods=['POST'])
@require_auth
def api_add_member(org_id):
    if not _require_org_owner(org_id):
        return jsonify({"error": "owner/admin required"}), 403
    data = request.get_json(silent=True) or {}
    user_id = (data.get("user_id") or "").strip()
    role = (data.get("role") or "member").strip()
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    try:
        rec = add_member(org_id, user_id, role)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "member": rec}), 201


@bp.route('/api/orgs/<org_id>/members/<user_id>', methods=['PATCH'])
@require_auth
def api_set_member_role(org_id, user_id):
    if not _require_org_owner(org_id):
        return jsonify({"error": "owner/admin required"}), 403
    data = request.get_json(silent=True) or {}
    role = (data.get("role") or "").strip()
    try:
        ok = set_member_role(org_id, user_id, role)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    if not ok:
        return jsonify({"error": "member not found"}), 404
    return jsonify({"success": True})


@bp.route('/api/orgs/<org_id>/members/<user_id>', methods=['DELETE'])
@require_auth
def api_remove_member(org_id, user_id):
    if not _require_org_owner(org_id):
        return jsonify({"error": "owner/admin required"}), 403
    if not remove_member(org_id, user_id):
        return jsonify({"error": "member not found"}), 404
    return jsonify({"success": True})