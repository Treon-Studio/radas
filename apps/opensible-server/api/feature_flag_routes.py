"""Feature flag routes for the RADAS control registry."""
from __future__ import annotations

import json
from flask import Blueprint, jsonify, request, Response

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.feature_flag_registry import audit, create_flag, delete_flag, evaluate, get_flag, list_flags, update_flag

bp = Blueprint("feature_flag_api", __name__)


def _scope_context(data=None):
    data = data or {}
    project_id = data.get("project_id") or request.args.get("project_id") or request.headers.get("X-Project-Id")
    org_id = data.get("org_id") or request.args.get("org_id")
    if project_id:
        # Project ownership is authoritative; never trust an org supplied alongside it.
        try:
            from auth.middleware import _org_id_of_project
            org_id = _org_id_of_project(project_id)
        except Exception:
            org_id = None
        return "project", project_id, org_id
    return ("organization", org_id, org_id) if org_id else ("global", None, None)


def _actor():
    user = getattr(request, "current_user", {}) or {}
    return (user.get("user_id", ""), user.get("username", ""))


@bp.route('/api/flags', methods=['GET'])
@require_auth
def api_list_flags():
    scope_type, scope_id, org_id = _scope_context()
    return jsonify({"flags": list_flags(scope_type, scope_id, effective=scope_type != "global", org_id=org_id)})


@bp.route('/api/flags/audit', methods=['GET'])
@require_auth
def api_flag_audit():
    scope_type, scope_id, _ = _scope_context()
    try:
        limit = max(1, min(500, int(request.args.get("limit", "100"))))
    except (TypeError, ValueError):
        limit = 100
    try:
        offset = max(0, int(request.args.get("offset", "0")))
    except (TypeError, ValueError):
        offset = 0
    return jsonify({"audit": audit(scope_type, scope_id, request.args.get("flag_key") or None, limit, offset)})


@bp.route('/api/flags', methods=['POST'])
@require_auth
def api_create_flag():
    data = request.get_json(silent=True) or {}
    scope_type, scope_id, org_id = _scope_context(data)
    actor_id, actor_name = _actor()
    try:
        flag = create_flag(data, scope_type, scope_id, actor=actor_id, actor_name=actor_name, org_id=org_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    return jsonify({"success": True, "flag": flag}), 201


@bp.route('/api/flags/<key>', methods=['PATCH'])
@require_auth
def api_update_flag(key):
    data = request.get_json(silent=True) or {}
    scope_type, scope_id, org_id = _scope_context(data)
    actor_id, actor_name = _actor()
    flag = update_flag(key, data, scope_type, scope_id, actor=actor_id, actor_name=actor_name, org_id=org_id)
    if not flag:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "flag": flag})


@bp.route('/api/flags/<key>', methods=['DELETE'])
@require_auth
def api_delete_flag(key):
    scope_type, scope_id, _ = _scope_context()
    actor_id, actor_name = _actor()
    if not delete_flag(key, scope_type, scope_id, actor=actor_id, actor_name=actor_name):
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True})


@bp.route('/api/flags/evaluate', methods=['POST'])
@require_auth
def api_evaluate_flag():
    data = request.get_json(silent=True) or {}
    key = (data.get("key") or "").strip()
    if not key:
        return jsonify({"error": "key required"}), 400
    scope_type, scope_id, org_id = _scope_context(data)
    return jsonify(evaluate(key, env=data.get("env") or "prod", user=data.get("user") or "", project_id=scope_id if scope_type == "project" else None, org_id=org_id))


@bp.route('/api/flags/export', methods=['GET'])
@require_auth
def api_export_flags():
    scope_type, scope_id, org_id = _scope_context()
    return Response(json.dumps({"flags": list_flags(scope_type, scope_id, org_id=org_id), "scope_type": scope_type, "scope_id": scope_id}, indent=2), mimetype="application/json", headers={"Content-Disposition": "attachment; filename=radas-flags.json"})


@bp.route('/api/flags/import', methods=['POST'])
@require_auth
def api_import_flags():
    data = request.get_json(silent=True) or {}
    scope_type, scope_id, org_id = _scope_context(data)
    actor_id, actor_name = _actor()
    imported = data.get("flags") if isinstance(data.get("flags"), list) else []
    created = []
    for flag in imported:
        try:
            created.append(create_flag(flag, scope_type, scope_id, actor=actor_id, actor_name=actor_name, org_id=org_id))
        except ValueError:
            continue
    return jsonify({"success": True, "imported": len(created), "flags": created}), 201


@bp.route('/api/flags/evaluations', methods=['GET'])
@require_auth
def api_flag_evaluations():
    scope_type, scope_id, _ = _scope_context()
    return jsonify({"evaluations": audit(scope_type, scope_id, request.args.get("flag_key"), min(500, int(request.args.get("limit", 100))) )})


@bp.route('/api/flags/<key>/rollback', methods=['POST'])
@require_auth
def api_flag_rollback(key):
    scope_type, scope_id, org_id = _scope_context()
    rows = audit(scope_type, scope_id, key, 50)
    previous = next((row.get("before") for row in rows if row.get("before")), None)
    if not previous:
        return jsonify({"error": "no previous version"}), 404
    actor_id, actor_name = _actor()
    restored = update_flag(key, previous, scope_type, scope_id, actor=actor_id, actor_name=actor_name, operation="rollback", org_id=org_id)
    return jsonify({"success": True, "flag": restored})
