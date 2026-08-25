"""MFA routes (Fase 5 — UC 40)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.mfa import (
    generate_secret, get_secret, otpauth_url, set_secret, verify,
)

bp = Blueprint("mfa_api", __name__)


def _uid():
    cu = getattr(request, "current_user", {}) or {}
    return cu.get("user_id") or ""


def _uname():
    cu = getattr(request, "current_user", {}) or {}
    return cu.get("username") or ""


@bp.route("/api/auth/mfa/enable", methods=["POST"])
@require_auth
def api_mfa_enable():
    secret = generate_secret()
    return jsonify({"success": True, "secret": secret, "otpauth_url": otpauth_url(_uid(), _uname(), secret)})


@bp.route("/api/auth/mfa/confirm", methods=["POST"])
@require_auth
def api_mfa_confirm():
    data = request.get_json(silent=True) or {}
    secret = (data.get("secret") or "").strip()
    code = (data.get("code") or "").strip()
    if not secret or not code:
        return jsonify({"error": "secret and code required"}), 400
    if not verify(secret, code):
        return jsonify({"error": "Invalid code"}), 400
    if not set_secret(_uid(), secret):
        return jsonify({"error": "Failed to save MFA secret"}), 500
    return jsonify({"success": True, "message": "MFA enabled"})


@bp.route("/api/auth/mfa/disable", methods=["POST"])
@require_auth
def api_mfa_disable():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    secret = get_secret(_uid())
    if not secret:
        return jsonify({"error": "MFA not enabled"}), 400
    if not verify(secret, code):
        return jsonify({"error": "Invalid code"}), 400
    set_secret(_uid(), None)
    return jsonify({"success": True, "message": "MFA disabled"})


@bp.route("/api/auth/mfa/status", methods=["GET"])
@require_auth
def api_mfa_status():
    return jsonify({"enabled": bool(get_secret(_uid()))})
