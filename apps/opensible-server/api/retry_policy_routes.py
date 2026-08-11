"""Retry policy routes (Fase 5 — UC 82)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.retry_policy import get_policy, save_policy, sweep_once

bp = Blueprint("retry_policy_api", __name__)


@bp.route('/api/retry-policy/<project_id>', methods=['GET'])
@require_auth
def api_get_retry_policy(project_id):
    return jsonify({"retry_policy": get_policy(project_id)})


@bp.route('/api/retry-policy/<project_id>', methods=['PUT'])
@require_auth
def api_put_retry_policy(project_id):
    data = request.get_json(silent=True) or {}
    try:
        pol = save_policy(project_id, int(data.get("max_retries") or 0), int(data.get("backoff_seconds") or 0))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid policy"}), 400
    return jsonify({"success": True, "retry_policy": pol})


@bp.route('/api/retry-policy/sweep', methods=['POST'])
@require_auth
def api_sweep():
    return jsonify(sweep_once())
