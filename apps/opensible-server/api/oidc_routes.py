"""OIDC SSO routes (Fase 5 — UC 98)."""
from __future__ import annotations

from flask import Blueprint, jsonify, redirect, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.oidc_service import (
    authorization_url, discovery, exchange_code, get_config, is_configured, save_config,
)

bp = Blueprint("oidc_api", __name__)


@bp.route('/api/oidc/config', methods=['GET'])
def api_get_oidc():
    c = get_config()
    c.pop("client_secret", None)
    return jsonify({"configured": is_configured(), "config": c})


@bp.route('/api/oidc/config', methods=['PUT'])
@require_auth
def api_put_oidc():
    data = request.get_json(silent=True) or {}
    if not data.get("issuer") or not data.get("client_id"):
        return jsonify({"error": "issuer and client_id required"}), 400
    return jsonify({"success": True, "config": save_config(data)})


@bp.route('/api/oidc/discovery', methods=['GET'])
@require_auth
def api_oidc_discovery():
    cfg = get_config()
    if not is_configured():
        return jsonify({"error": "OIDC not configured"}), 400
    try:
        meta = discovery(cfg["issuer"])
    except Exception as e:
        return jsonify({"error": f"discovery failed: {e}"}), 502
    return jsonify({"issuer": meta.get("issuer"),
                    "authorization_endpoint": meta.get("authorization_endpoint"),
                    "token_endpoint": meta.get("token_endpoint")})


@bp.route('/api/auth/sso', methods=['GET'])
def api_sso_start():
    cfg = get_config()
    if not is_configured():
        return jsonify({"error": "OIDC not configured"}), 400
    try:
        meta = discovery(cfg["issuer"])
        return redirect(authorization_url(cfg, meta))
    except Exception as e:
        return jsonify({"error": f"SSO start failed: {e}"}), 502


@bp.route('/api/auth/sso/callback', methods=['GET'])
def api_sso_callback():
    code = request.args.get("code") or ""
    if not code:
        return jsonify({"error": "missing code"}), 400
    cfg = get_config()
    try:
        meta = discovery(cfg["issuer"])
        tokens = exchange_code(cfg, meta, code)
    except Exception as e:
        return jsonify({"error": f"SSO callback failed: {e}"}), 502
    id_token = tokens.get("id_token") or ""
    if not id_token:
        return jsonify({"error": "no id_token in response"}), 502
    # Verify signature (JWKS), audience and issuer.
    try:
        from services.oidc_service import validate_id_token
        claims = validate_id_token(id_token, cfg["client_id"], meta)
    except Exception as e:
        return jsonify({"error": f"id_token validation failed: {e}"}), 401
    # Find-or-create the local user keyed by SSO subject/email.
    try:
        from services.user_service import get_user_service
        from auth.service import generate_token
        import secrets as _secrets
        username = claims.get("email") or claims.get("preferred_username") or claims.get("sub") or ""
        if not username:
            return jsonify({"error": "id_token missing subject/email"}), 401
        user_service = get_user_service()
        user = user_service.get_user_by_username(username)
        if not user:
            user = user_service.create_user(
                username=username,
                password=_secrets.token_urlsafe(24),
                email=claims.get("email"),
                roles=[],
            )
        user_service, role_service, _, DATA_DIR = _services()
        role_names = []
        for role_id in user.roles:
            role = role_service.get_role_by_id(role_id)
            if role:
                role_names.append(role.name)
        access_token = generate_token(user_id=user.id, username=user.username, roles=role_names,
                                      data_dir=DATA_DIR, token_type="access")
        refresh_token = generate_token(user_id=user.id, username=user.username, roles=role_names,
                                       data_dir=DATA_DIR, token_type="refresh")
        return jsonify({"success": True, "access_token": access_token,
                        "refresh_token": refresh_token,
                        "user": {"id": user.id, "username": user.username, "email": user.email, "roles": role_names}})
    except Exception as e:
        return jsonify({"error": f"SSO user provisioning failed: {e}"}), 500
