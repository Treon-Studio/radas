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
@require_auth
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
    # TODO(verify): validate id_token (issuer/aud/exp) + create/link local user.
    id_token = tokens.get("id_token") or ""
    return jsonify({"success": True, "id_token": id_token[:40] + "…", "note": "user provisioning TBD with a real IdP"})
