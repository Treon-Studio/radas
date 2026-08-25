"""
Google Single Sign-On (OAuth 2.0 / OIDC) API Endpoints.
"""
from __future__ import annotations

import logging
from flask import Blueprint, current_app, jsonify, request

from services import google_oauth

logger = logging.getLogger(__name__)

bp = Blueprint("google_oauth_api", __name__)


def _services():
    """Pull singletons from current_app or app.py at call-time."""
    import sys
    from pathlib import Path
    if hasattr(current_app, "user_service"):
        return (
            getattr(current_app, "user_service", None),
            getattr(current_app, "role_service", None),
            getattr(current_app, "access_control_service", None),
            getattr(current_app, "DATA_DIR", getattr(current_app, "config", {}).get("DATA_DIR", Path("data"))),
        )
    app_mod = next(
        (m for m in (sys.modules.get("__main__"), sys.modules.get("app")) if getattr(m, "user_service", None)),
        None,
    )
    return (
        getattr(app_mod, "user_service", None),
        getattr(app_mod, "role_service", None),
        getattr(app_mod, "access_control_service", None),
        getattr(app_mod, "DATA_DIR", Path("data")),
    )


@bp.route("/api/auth/google/config", methods=["GET"])
def api_google_config():
    """Check if Google SSO is enabled and retrieve public client ID."""
    return jsonify({
        "success": True,
        "enabled": True,  # Always available (with dev mock or live OAuth)
        "is_configured": google_oauth.is_configured(),
        "client_id": google_oauth.get_client_id(),
    })


@bp.route("/api/auth/google/url", methods=["GET"])
def api_google_url():
    """Retrieve the Google OAuth 2.0 authorization URL."""
    state = request.args.get("state")
    redirect_uri = request.args.get("redirect_uri", "")
    info = google_oauth.generate_auth_url(state=state, redirect_uri=redirect_uri)
    return jsonify({
        "success": True,
        **info,
    })


@bp.route("/api/auth/google/callback", methods=["POST"])
def api_google_callback():
    """Exchange authorization code from Google for a RADAS session."""
    user_service, role_service, _, DATA_DIR = _services()
    try:
        data = request.json or {}
        code = (data.get("code") or "").strip()
        redirect_uri = data.get("redirect_uri", "")

        if not code:
            return jsonify({"success": False, "error": "Authorization code is required"}), 400

        user_info = google_oauth.exchange_code(code=code, redirect_uri=redirect_uri)
        session_data = google_oauth.handle_google_user_session(
            user_info=user_info,
            user_service=user_service,
            role_service=role_service,
            data_dir=DATA_DIR,
        )
        return jsonify(session_data)
    except Exception as e:
        logger.error(f"Google OAuth callback error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 400


@bp.route("/api/auth/google/token", methods=["POST"])
def api_google_token_login():
    """Authenticate via Google One Tap or Google Sign-In ID Token."""
    user_service, role_service, _, DATA_DIR = _services()
    try:
        data = request.json or {}
        id_token = (data.get("id_token") or data.get("credential") or "").strip()

        if not id_token:
            return jsonify({"success": False, "error": "ID token / credential is required"}), 400

        user_info = google_oauth.verify_google_id_token(id_token)
        session_data = google_oauth.handle_google_user_session(
            user_info=user_info,
            user_service=user_service,
            role_service=role_service,
            data_dir=DATA_DIR,
        )
        return jsonify(session_data)
    except Exception as e:
        logger.error(f"Google ID token login error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 400
