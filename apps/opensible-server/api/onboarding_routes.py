"""Onboarding API routes (UC397)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from auth.middleware import require_auth
from services import onboarding_service

bp = Blueprint("onboarding_api", __name__)


@bp.route("/api/onboarding/status", methods=["GET"])
@require_auth
def get_onboarding_status():
    """Get onboarding status for the current user."""
    user_id = request.current_user.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    status = onboarding_service.get_status(user_id)
    return jsonify(status)


@bp.route("/api/onboarding/complete", methods=["POST"])
@require_auth
def complete_onboarding():
    """Mark onboarding as completed for the current user."""
    user_id = request.current_user.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    status = onboarding_service.mark_completed(user_id)
    return jsonify(status)


@bp.route("/api/onboarding/reset", methods=["POST"])
@require_auth
def reset_onboarding():
    """Reset onboarding status (for testing)."""
    user_id = request.current_user.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    status = onboarding_service.reset_onboarding(user_id)
    return jsonify(status)