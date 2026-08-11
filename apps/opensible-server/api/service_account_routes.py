"""Service accounts (Fase 2 — UC 75) + guest/readonly (UC 74)."""
from __future__ import annotations

import re

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from storage.api_tokens_store import create_token, list_tokens, revoke_token, _load_index

bp = Blueprint("service_accounts_api", __name__)

VALID_ROLES = ("admin", "readonly", "operator")


def _is_sa(user_id: str) -> bool:
    return str(user_id or "").startswith("service-")


@bp.route('/api/service-accounts', methods=['GET'])
@require_auth
def api_list_service_accounts():
    data = _load_index()
    out = []
    for t in data.get('tokens', []):
        if not _is_sa(t.get('userId')):
            continue
        out.append({
            "id": t.get("id"),
            "name": t.get("name"),
            "roles": t.get("roles") or [],
            "created_at": t.get("createdAt"),
            "expires_at": t.get("expiresAt"),
            "revoked": t.get("revoked"),
            "last_used_at": t.get("lastUsedAt"),
        })
    return jsonify({"service_accounts": out})


@bp.route('/api/service-accounts', methods=['POST'])
@require_auth
def api_create_service_account():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    roles = [str(r) for r in (data.get("roles") or [])]
    if not name:
        return jsonify({"error": "name required"}), 400
    bad = [r for r in roles if r not in VALID_ROLES]
    if bad:
        return jsonify({"error": f"invalid roles: {bad} (allowed: {VALID_ROLES})"}), 400
    slug = re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-") or "sa"
    try:
        expires_days = int(data.get("expires_days") or 0)
    except (TypeError, ValueError):
        expires_days = 0
    token_id, plaintext = create_token(
        user_id=f"service-{slug}",
        username=name,
        name=name,
        roles=roles,
        expires_days=expires_days or None,
    )
    return jsonify({"success": True, "token_id": token_id,
                    "token": plaintext,  # shown once
                    "roles": roles}), 201


@bp.route('/api/service-accounts/<token_id>', methods=['DELETE'])
@require_auth
def api_delete_service_account(token_id):
    data = _load_index()
    entry = next((t for t in data.get('tokens', []) if t.get('id') == token_id), None)
    if not entry or not _is_sa(entry.get('userId')):
        return jsonify({"error": "not found"}), 404
    revoke_token(token_id, entry.get('userId'))
    return jsonify({"success": True})
