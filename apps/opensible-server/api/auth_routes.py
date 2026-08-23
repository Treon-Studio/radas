"""Auth routes blueprint (Phase 2).

Moved from app.py: /api/auth/login, /logout, /refresh, /me.
"""
from __future__ import annotations

import os
import threading
import time

from flask import Blueprint, current_app, jsonify, request

from auth import add_token_to_blacklist, generate_token, verify_token
from auth.middleware import require_auth
from auth.validators import validate_password, validate_username

bp = Blueprint("auth_api", __name__)

from services.login_security import (
    record_login_attempt,
    is_login_rate_limited,
    reset_login_rate_limit,
)


def _services():
    """Pull singletons from app.py at call-time (avoids circular import)."""
    import sys
    app_mod = next(
        (m for m in (sys.modules.get("__main__"), sys.modules.get("app")) if getattr(m, "user_service", None)),
        None,
    )
    return (
        app_mod.user_service,
        app_mod.role_service,
        app_mod.access_control_service,
        app_mod.DATA_DIR,
    )


@bp.route("/api/auth/login", methods=["POST"])
def api_auth_login():
    user_service, role_service, _, DATA_DIR = _services()
    try:
        data = request.json or {}
        username = data.get("username", "").strip()
        password = data.get("password", "")

        client_ip = (request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
                     or request.remote_addr or "unknown")
        is_blocked, retry_after = is_login_rate_limited(username, client_ip)
        if is_blocked:
            current_app.logger.warning(f"Login rate limit hit for {client_ip}|{username}")
            return jsonify({"success": False, "error": f"Too many login attempts. Please wait {retry_after}s and try again."}), 429

        is_valid, error_msg = validate_username(username)
        if not is_valid:
            record_login_attempt(username, client_ip, success=False)
            return jsonify({"success": False, "error": error_msg}), 400

        if not password or not isinstance(password, str):
            record_login_attempt(username, client_ip, success=False)
            return jsonify({"success": False, "error": "Password is required"}), 400

        user = user_service.authenticate(username, password)
        if not user:
            record_login_attempt(username, client_ip, success=False)
            current_app.logger.warning(f"Failed login attempt for username: {username} from {client_ip}")
            return jsonify({"success": False, "error": "Incorrect username or password"}), 401

        record_login_attempt(username, client_ip, success=True)

        role_names = []
        for role_id in user.roles:
            role = role_service.get_role_by_id(role_id)
            if role:
                role_names.append(role.name)

        # MFA challenge (Fase 5 — UC 40): if the user enrolled a TOTP secret,
        # issue a short-lived mfa token instead of the access token.
        from services.mfa import get_secret as _mfa_get
        if _mfa_get(user.id):
            mfa_token = generate_token(user_id=user.id, username=user.username, roles=role_names,
                                       data_dir=DATA_DIR, token_type="mfa")
            current_app.logger.info(f"User {username} passed password step; MFA required")
            return jsonify({
                "success": True,
                "mfa_required": True,
                "mfa_token": mfa_token,
                "user": {"id": user.id, "username": user.username},
            })

        access_token = generate_token(user_id=user.id, username=user.username, roles=role_names,
                                      data_dir=DATA_DIR, token_type="access")
        refresh_token = generate_token(user_id=user.id, username=user.username, roles=role_names,
                                       data_dir=DATA_DIR, token_type="refresh")

        # Org context (Fase 7 — D3): user's orgs + active org in token.
        orgs = []
        org_id = None
        try:
            from services.org_service import list_orgs_for_user
            orgs = list_orgs_for_user(user.id)
            if orgs:
                org_id = orgs[0]["id"]
        except Exception:
            orgs = []
        if org_id:
            access_token = generate_token(user_id=user.id, username=user.username,
                                          roles=role_names, data_dir=DATA_DIR,
                                          token_type="access", org_id=org_id)
            refresh_token = generate_token(user_id=user.id, username=user.username,
                                           roles=role_names, data_dir=DATA_DIR,
                                           token_type="refresh", org_id=org_id)

        current_app.logger.info(f"User {username} logged in successfully")
        return jsonify({
            "success": True,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "orgs": orgs,
            "active_org_id": org_id,
            "user": {"id": user.id, "username": user.username, "email": user.email, "roles": role_names},
        })
    except Exception as e:
        current_app.logger.error(f"Error in login: {e}", exc_info=True)
        return jsonify({"success": False, "error": "Login error"}), 500


@bp.route("/api/auth/forgot-password", methods=["POST"])
def api_auth_forgot_password():
    """Request a password-reset link.

    Looks the user up by username, issues a short-lived ``reset`` JWT, and
    hands the reset URL to the notification courier (Slack webhook configured
    per user, or outbound webhooks subscribed to ``auth.password_reset``).
    When no channel is configured the link is returned inline so a self-hosted
    operator can copy it. The response never reveals whether the user exists.
    """
    user_service, _, _, DATA_DIR = _services()
    try:
        data = request.json or {}
        username = (data.get("username") or "").strip()

        client_ip = (request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
                     or request.remote_addr or "unknown")
        is_blocked, retry_after = is_login_rate_limited(f"forgot:{username}", client_ip)
        if is_blocked:
            current_app.logger.warning(f"Forgot-password rate limit hit for {client_ip}|forgot:{username}")
            return jsonify({"success": False, "error": f"Too many requests. Please wait {retry_after}s and try again."}), 429

        is_valid, error_msg = validate_username(username)
        if not is_valid:
            record_login_attempt(f"forgot:{username}", client_ip, success=False)
            return jsonify({"success": False, "error": error_msg}), 400

        # Always behave the same whether or not the user exists (no oracle).
        user = user_service.get_user_by_username(username)
        if not user or not user.is_active:
            current_app.logger.info(f"Forgot-password lookup miss for username: {username}")
            return jsonify({
                "success": True,
                "message": "If that account exists, a reset link has been sent.",
                "reset_url": None,
                "delivery": {"delivered": False, "channel": None, "inline": True},
            })

        from datetime import timedelta
        reset_token = generate_token(
            user_id=user.id, username=user.username, roles=[],
            data_dir=DATA_DIR, token_type="reset",
            expires_delta=timedelta(minutes=15),
        )

        # Build the reset URL from the requesting console origin when known,
        # otherwise fall back to the CORS allowlist default.
        origin = (request.headers.get("Origin")
                  or request.headers.get("Referer") or "").rstrip("/")
        if not origin:
            origin = (os.environ.get("CONSOLE_BASE_URL")
                      or (os.environ.get("CORS_ALLOWED_ORIGINS") or "").split(",")[0]
                      or "http://localhost:8080").rstrip("/")
        reset_url = f"{origin}/reset-password?token={reset_token}"

        from services.notif_courier import deliver_reset_link
        delivery = deliver_reset_link(user.id, user.username, user.email, reset_url)
        current_app.logger.info(f"Forgot-password for {user.username}: "
                                f"delivered={delivery['delivered']} channel={delivery['channel']}")

        # If the courier had no channel, return the link inline so the operator
        # can use it. Otherwise only a generic message (never the token).
        inline = not delivery["delivered"]
        return jsonify({
            "success": True,
            "message": "If that account exists, a reset link has been sent.",
            "reset_url": reset_url if inline else None,
            "delivery": {**delivery, "inline": inline},
        })
    except Exception as e:
        current_app.logger.error(f"Error in forgot-password: {e}", exc_info=True)
        return jsonify({"success": False, "error": "Request error"}), 500


@bp.route("/api/auth/reset-password", methods=["POST"])
def api_auth_reset_password():
    """Complete a password reset with a short-lived ``reset`` token."""
    user_service, _, _, DATA_DIR = _services()
    try:
        data = request.json or {}
        token = (data.get("token") or "").strip()
        new_password = data.get("password") or ""

        if not token:
            return jsonify({"success": False, "error": "Reset token is required"}), 400

        is_valid, error_msg = validate_password(new_password)
        if not is_valid:
            return jsonify({"success": False, "error": error_msg}), 400

        payload = verify_token(token, DATA_DIR, token_type="reset")
        if not payload:
            return jsonify({"success": False, "error": "Invalid or expired reset link"}), 401

        user_id = payload.get("user_id")
        user = user_service.get_user_by_id(user_id)
        if not user or not user.is_active:
            return jsonify({"success": False, "error": "User not found or inactive"}), 401

        ok = user_service.set_password(user_id, new_password)
        if not ok:
            return jsonify({"success": False, "error": "User not found"}), 404

        # The reset link is single-use.
        add_token_to_blacklist(DATA_DIR, token)
        current_app.logger.info(f"Password reset completed for {user.username}")
        return jsonify({"success": True, "message": "Password has been reset. You can now sign in."})
    except Exception as e:
        current_app.logger.error(f"Error in reset-password: {e}", exc_info=True)
        return jsonify({"success": False, "error": "Reset error"}), 500


@bp.route("/api/auth/logout", methods=["POST"])
@require_auth
def api_auth_logout():
    _, _, _, DATA_DIR = _services()
    try:
        token = request.token
        if token:
            add_token_to_blacklist(DATA_DIR, token)
            current_app.logger.info(f"User {request.current_user.get('username')} logged out")
        return jsonify({"success": True, "message": "Logged out"})
    except Exception as e:
        current_app.logger.error(f"Error in logout: {e}", exc_info=True)
        return jsonify({"success": False, "error": "Logout error"}), 500


@bp.route("/api/auth/revoke-all-sessions", methods=["POST"])
@require_auth
def api_auth_revoke_all_sessions():
    """Revoke all current sessions and active tokens for the authenticated user (UC635)."""
    from auth.service import revoke_all_user_sessions
    _, _, _, DATA_DIR = _services()
    try:
        user_id = request.current_user.get("user_id")
        if not user_id:
            return jsonify({"success": False, "error": "User not authenticated"}), 401
        cutoff = revoke_all_user_sessions(user_id, DATA_DIR)
        current_app.logger.info(f"User {user_id} revoked all sessions at {cutoff}")
        return jsonify({"success": True, "message": "All sessions and tokens revoked", "revoked_at": cutoff})
    except Exception as e:
        current_app.logger.error(f"Error revoking sessions: {e}", exc_info=True)
        return jsonify({"success": False, "error": "Revoke sessions error"}), 500


@bp.route("/api/auth/refresh", methods=["POST"])
def api_auth_refresh():
    user_service, role_service, _, DATA_DIR = _services()
    try:
        data = request.json or {}
        refresh_token = data.get("refresh_token", "").strip()
        if not refresh_token:
            return jsonify({"success": False, "error": "Refresh token required"}), 400

        payload = verify_token(refresh_token, DATA_DIR, token_type="refresh")
        if not payload:
            return jsonify({"success": False, "error": "Invalid refresh token"}), 401

        user_id = payload.get("user_id")
        user = user_service.get_user_by_id(user_id)
        if not user or not user.is_active:
            return jsonify({"success": False, "error": "User not found or inactive"}), 401

        role_names = []
        for role_id in user.roles:
            role = role_service.get_role_by_id(role_id)
            if role:
                role_names.append(role.name)

        access_token = generate_token(user_id=user.id, username=user.username, roles=role_names,
                                      data_dir=DATA_DIR, token_type="access")
        return jsonify({"success": True, "access_token": access_token})
    except Exception as e:
        current_app.logger.error(f"Error in refresh: {e}", exc_info=True)
        return jsonify({"success": False, "error": "Token refresh error"}), 500


@bp.route("/api/auth/me", methods=["GET"])
@require_auth
def api_auth_me():
    user_service, role_service, access_control_service, _ = _services()
    try:
        user_id = request.current_user.get("user_id")
        user = user_service.get_user_by_id(user_id)
        if not user:
            return jsonify({"success": False, "error": "User not found"}), 404

        role_names, role_details = [], []
        for role_id in user.roles:
            role = role_service.get_role_by_id(role_id)
            if role:
                role_names.append(role.name)
                role_details.append({"id": role.id, "name": role.name, "description": role.description})

        permissions = access_control_service.get_user_permissions(user_id)
        return jsonify({
            "success": True,
            "user": {
                "id": user.id, "username": user.username, "email": user.email,
                "roles": role_names, "role_details": role_details,
                "permissions": list(permissions),
                "is_active": user.is_active,
                "created_at": user.created_at, "last_login": user.last_login,
            },
        })
    except Exception as e:
        current_app.logger.error(f"Error in /api/auth/me: {e}", exc_info=True)
        return jsonify({"success": False, "error": "Error getting user information"}), 500

@bp.route("/api/auth/mfa/verify", methods=["POST"])
def api_mfa_verify():
    """Complete the MFA challenge: validate TOTP code + mfa token, issue access tokens."""
    from auth.service import generate_token, verify_token
    from services.mfa import get_secret as _mfa_get, verify as _mfa_verify
    data = request.json or {}
    mfa_token = (data.get("mfa_token") or "").strip()
    code = (data.get("code") or "").strip()
    user_service, role_service, _, DATA_DIR = _services()
    payload = verify_token(mfa_token, DATA_DIR, token_type="mfa")
    if not payload:
        return jsonify({"success": False, "error": "Invalid or expired MFA token"}), 401
    uid = payload.get("user_id")
    secret = _mfa_get(uid or "")
    if not secret or not _mfa_verify(secret, code):
        return jsonify({"success": False, "error": "Invalid MFA code"}), 401
    user = user_service.get_user_by_id(uid)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 401
    role_names = []
    for role_id in user.roles:
        role = role_service.get_role_by_id(role_id)
        if role:
            role_names.append(role.name)
    access_token = generate_token(user_id=user.id, username=user.username, roles=role_names,
                                  data_dir=DATA_DIR, token_type="access")
    refresh_token = generate_token(user_id=user.id, username=user.username, roles=role_names,
                                   data_dir=DATA_DIR, token_type="refresh")
    return jsonify({
        "success": True,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": {"id": user.id, "username": user.username, "roles": role_names},
    })


@bp.route("/api/auth/switch-org", methods=["POST"])
@require_auth
def api_auth_switch_org():
    """Switch active org: returns fresh access/refresh tokens carrying org_id."""
    from auth.service import generate_token as _gt
    try:
        _, _, _, DATA_DIR = _services()
        data = request.get_json(silent=True) or {}
        org_id = (data.get("org_id") or "").strip()
        cu = getattr(request, "current_user", {}) or {}
        uid = cu.get("user_id") or ""
        username = cu.get("username") or ""
        roles = cu.get("roles") or []
        if not org_id:
            return jsonify({"error": "org_id required"}), 400
        from services.org_service import is_member
        if not is_member(org_id, uid):
            return jsonify({"error": "not a member of this org"}), 403
        access_token = _gt(uid, username, roles, DATA_DIR, token_type="access", org_id=org_id)
        refresh_token = _gt(uid, username, roles, DATA_DIR, token_type="refresh", org_id=org_id)
        return jsonify({
            "success": True,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "active_org_id": org_id,
        })
    except Exception as e:
        current_app.logger.error(f"Error switching org: {e}", exc_info=True)
        return jsonify({"success": False, "error": "Switch org error"}), 500

