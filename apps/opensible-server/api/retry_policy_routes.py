"""Retry policy routes (Fase 5 — UC 82)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from services.retry_policy import get_policy, save_policy, sweep_once

bp = Blueprint("retry_policy_api", __name__)


@bp.route('/api/retry-policy/<project_id>', methods=['GET'])
@require_project_access
def api_get_retry_policy(project_id):
    stack = request.args.get('stack', '').strip() or None
    return jsonify({"retry_policy": get_policy(project_id, stack)})


@bp.route('/api/retry-policy/<project_id>', methods=['PUT'])
@require_project_access
def api_put_retry_policy(project_id):
    data = request.get_json(silent=True) or {}
    try:
        max_retries = int(data.get("max_retries") or 0)
        backoff_seconds = int(data.get("backoff_seconds") or 0)
        stack = data.get('stack', '').strip() or None
        if stack is not None and not stack:
            return jsonify({"error": "stack must be a non-empty string if provided"}), 400
        pol = save_policy(project_id, max_retries, backoff_seconds, stack)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid policy"}), 400
    return jsonify({"success": True, "retry_policy": pol})


@bp.route('/api/retry-policy/<project_id>/stacks/<stack_name>', methods=['GET'])
@require_project_access
def api_get_stack_retry_policy(project_id, stack_name):
    return jsonify({"retry_policy": get_policy(project_id, stack_name)})


@bp.route('/api/retry-policy/<project_id>/stacks/<stack_name>', methods=['PUT'])
@require_project_access
def api_put_stack_retry_policy(project_id, stack_name):
    data = request.get_json(silent=True) or {}
    try:
        pol = save_policy(project_id, int(data.get("max_retries") or 0), int(data.get("backoff_seconds") or 0), stack_name=stack_name)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid policy"}), 400
    return jsonify({"success": True, "retry_policy": pol})


@bp.route('/api/retry-policy/sweep', methods=['POST'])
@require_auth
def api_sweep():
    return jsonify(sweep_once())
