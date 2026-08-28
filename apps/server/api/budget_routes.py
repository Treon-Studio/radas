"""Budget CRUD + check routes (Fase 1 — UC 30)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from services.budget_service import (
    check_budget, delete_budget, get_budget, save_budget,
)

bp = Blueprint("budget_api", __name__)


@bp.route('/api/budget/<project_id>', methods=['GET'])
@require_project_access
def api_get_budget(project_id):
    b = get_budget(project_id)
    if not b:
        return jsonify({"configured": False})
    return jsonify({"configured": True, "budget": b})


@bp.route('/api/budget/<project_id>', methods=['PUT'])
@require_project_access
def api_put_budget(project_id):
    data = request.get_json(silent=True) or {}
    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid amount", "message": "amount must be a number"}), 400
    raw_pct = data.get("alert_at_pct")
    if raw_pct is None:
        raw_pct = 80
    try:
        alert_at_pct = float(raw_pct)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid alert_at_pct", "message": "alert_at_pct must be a number"}), 400
    try:
        # Service-level validation rejects negative, NaN, infinite and
        # oversized amounts and out-of-range alert_at_pct (Task 5.5).
        b = save_budget(project_id, amount, str(data.get("currency") or "USD"), alert_at_pct)
    except ValueError as exc:
        message = str(exc) or "invalid budget input"
        key = "invalid alert_at_pct" if "alert_at_pct" in message else "invalid amount"
        return jsonify({"error": key, "message": message}), 400
    return jsonify({"success": True, "budget": b})


@bp.route('/api/budget/<project_id>', methods=['DELETE'])
@require_project_access
def api_delete_budget(project_id):
    if not delete_budget(project_id):
        return jsonify({"error": "not found", "message": "no budget configured"}), 404
    return jsonify({"success": True})


@bp.route('/api/budget/<project_id>/check', methods=['POST'])
@require_project_access
def api_check_budget(project_id):
    return jsonify(check_budget(project_id))
