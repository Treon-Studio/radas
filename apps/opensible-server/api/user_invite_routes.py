#!/usr/bin/env python3
"""User invitation API routes (UC625)."""
from __future__ import annotations

import logging
from flask import Blueprint, jsonify, request

from auth.middleware import require_auth
from services.user_invite_service import (
    create_user_invite,
    get_user_invite,
    claim_user_invite,
    list_user_invites,
    revoke_user_invite,
)

logger = logging.getLogger(__name__)
bp = Blueprint("user_invite_api", __name__)


@bp.route("/api/users/invites", methods=["POST"])
@require_auth
def api_create_invite():
    data = request.json or {}
    email = (data.get("email") or "").strip()
    if not email:
        return jsonify({"success": False, "error": "Email is required"}), 400

    roles = data.get("roles", ["viewer"])
    org_id = data.get("org_id")
    ttl_seconds = int(data.get("ttl_seconds", 7 * 86400))
    invited_by = getattr(request, "current_user", {}).get("user_id", "admin")

    invite = create_user_invite(
        email=email,
        roles=roles,
        invited_by=invited_by,
        org_id=org_id,
        ttl_seconds=ttl_seconds,
    )
    return jsonify({"success": True, "invite": invite}), 201


@bp.route("/api/users/invites", methods=["GET"])
@require_auth
def api_list_invites():
    org_id = request.args.get("org_id")
    invites = list_user_invites(org_id=org_id)
    return jsonify({"success": True, "invites": invites, "count": len(invites)})


@bp.route("/api/users/invites/<token>", methods=["GET"])
def api_get_invite(token: str):
    invite = get_user_invite(token)
    if not invite:
        return jsonify({"success": False, "error": "Invitation not found"}), 404
    return jsonify({"success": True, "invite": invite})


@bp.route("/api/users/invites/<token>/claim", methods=["POST"])
def api_claim_invite(token: str):
    data = request.json or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"success": False, "error": "Username and password are required"}), 400

    try:
        res = claim_user_invite(token=token, username=username, password=password)
        return jsonify(res), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as exc:
        logger.error(f"Error claiming invite {token}: {exc}", exc_info=True)
        return jsonify({"success": False, "error": str(exc)}), 500


@bp.route("/api/users/invites/<token>", methods=["DELETE"])
@require_auth
def api_revoke_invite(token: str):
    success = revoke_user_invite(token)
    if not success:
        return jsonify({"success": False, "error": "Invitation not found"}), 404
    return jsonify({"success": True, "message": "Invitation revoked"})
