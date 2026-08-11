"""Budget CRUD + check routes (Fase 1 — UC 30)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.budget_service import (
    check_budget, delete_budget, get_budget, save_budget,
)

bp = Blueprint("budget_api", __name__)


@bp.route('/api/budget/<project_id>', methods=['GET'])
@require_auth
def api_get_budget(project_id):
    b = get_budget(project_id)
    if not b:
        return jsonify({"configured": False})
    return jsonify({"configured": True, "budget": b})


@bp.route('/api/budget/<project_id>', methods=['PUT'])
@require_auth
def api_put_budget(project_id):
    data = request.get_json(silent=True) or {}
    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid amount", "message": "amount must be a number"}), 400
    if amount <= 0:
        return jsonify({"error": "invalid amount", "message": "amount must be > 0"}), 400
    b = save_budget(project_id, amount, str(data.get("currency") or "USD"),
                    float(data.get("alert_at_pct") or 80))
    return jsonify({"success": True, "budget": b})


@bp.route('/api/budget/<project_id>', methods=['DELETE'])
@require_auth
def api_delete_budget(project_id):
    if not delete_budget(project_id):
        return jsonify({"error": "not found", "message": "no budget configured"}), 404
    return jsonify({"success": True})


@bp.route('/api/budget/<project_id>/check', methods=['POST'])
@require_auth
def api_check_budget(project_id):
    return jsonify(check_budget(project_id))
