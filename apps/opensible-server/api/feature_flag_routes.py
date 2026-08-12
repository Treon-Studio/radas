"""Feature flag routes (Fase 6 — UC 113+)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.feature_flags import (
    create_flag, delete_flag, evaluate, get_flag, list_flags, update_flag,
)

bp = Blueprint("feature_flag_api", __name__)


@bp.route('/api/flags', methods=['GET'])
@require_auth
def api_list_flags():
    return jsonify({"flags": list_flags()})


@bp.route('/api/flags/audit', methods=['GET'])
@require_auth
def api_flag_audit():
    from services.feature_flags import flag_audit
    limit = request.args.get("limit", "100")
    try:
        limit = max(1, min(500, int(limit)))
    except (TypeError, ValueError):
        limit = 100
    key = (request.args.get("flag_key") or "").strip() or None
    return jsonify({"audit": flag_audit(limit=limit, flag_key=key)})


@bp.route('/api/flags', methods=['POST'])
@require_auth
def api_create_flag():
    data = request.get_json(silent=True) or {}
    try:
        flag = create_flag(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 409
    return jsonify({"success": True, "flag": flag}), 201


@bp.route('/api/flags/<key>', methods=['PATCH'])
@require_auth
def api_update_flag(key):
    flag = update_flag(key, request.get_json(silent=True) or {})
    if not flag:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "flag": flag})


@bp.route('/api/flags/<key>', methods=['DELETE'])
@require_auth
def api_delete_flag(key):
    if not delete_flag(key):
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True})


@bp.route('/api/flags/evaluate', methods=['POST'])
@require_auth
def api_evaluate_flag():
    data = request.get_json(silent=True) or {}
    key = (data.get("key") or "").strip()
    if not key:
        return jsonify({"error": "key required"}), 400
    return jsonify(evaluate(key, env=data.get("env") or "prod", user=data.get("user") or ""))
