#!/usr/bin/env python3
"""
User invitation lifecycle service (UC625).
Handles invitation generation with TTL, pre-assigned roles, org association, and account claiming.
"""
from __future__ import annotations

import logging
import secrets
import time
from typing import Any, Dict, List, Optional

from storage import kv

logger = logging.getLogger(__name__)

SCOPE_INVITES = "user_invites"
DEFAULT_TTL_SECONDS = 7 * 86400  # 7 days


def create_user_invite(
    email: str,
    roles: List[str],
    invited_by: str,
    org_id: Optional[str] = None,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> Dict[str, Any]:
    """Create a user invitation with pre-assigned roles and TTL."""
    token = secrets.token_urlsafe(32)
    now = time.time()
    expires_at = now + ttl_seconds

    invite = {
        "token": token,
        "email": (email or "").strip().lower(),
        "roles": roles or ["viewer"],
        "invited_by": invited_by,
        "org_id": org_id,
        "status": "pending",
        "created_at": now,
        "expires_at": expires_at,
        "claimed_at": None,
        "claimed_by_user_id": None,
    }

    kv.kv_set(SCOPE_INVITES, token, invite)
    logger.info(f"Created user invite for {email} (token={token[:8]}...)")
    return invite


def get_user_invite(token: str) -> Optional[Dict[str, Any]]:
    """Retrieve an invitation and evaluate its expiration status."""
    invite = kv.kv_get(SCOPE_INVITES, token)
    if not invite or not isinstance(invite, dict):
        return None

    # Check if expired
    if invite.get("status") == "pending":
        if time.time() > invite.get("expires_at", 0):
            invite["status"] = "expired"
            kv.kv_set(SCOPE_INVITES, token, invite)

    return invite


def list_user_invites(org_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """List all invitations, optionally filtered by org_id."""
    raw_list = kv.kv_list(SCOPE_INVITES)
    invites = []
    now = time.time()
    for item in raw_list:
        inv = item.get("value")
        if not isinstance(inv, dict):
            continue
        if org_id and inv.get("org_id") != org_id:
            continue
        if inv.get("status") == "pending" and now > inv.get("expires_at", 0):
            inv["status"] = "expired"
        invites.append(inv)
    return invites


def revoke_user_invite(token: str) -> bool:
    """Revoke a pending user invitation."""
    invite = get_user_invite(token)
    if not invite:
        return False
    invite["status"] = "revoked"
    kv.kv_set(SCOPE_INVITES, token, invite)
    logger.info(f"Revoked user invite {token[:8]}...")
    return True


def claim_user_invite(
    token: str,
    username: str,
    password: str,
    user_service: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Claim an invitation, creating the user account with pre-assigned roles
    and org membership.
    """
    invite = get_user_invite(token)
    if not invite:
        raise ValueError("Invalid invitation token")

    status = invite.get("status")
    if status != "pending":
        raise ValueError(f"Invitation is {status}, not pending")

    if not user_service:
        import sys
        app_mod = next(
            (m for m in (sys.modules.get("__main__"), sys.modules.get("app")) if getattr(m, "user_service", None)),
            None,
        )
        if app_mod:
            user_service = app_mod.user_service

    if not user_service:
        from app_context import get_data_dir
        from services.user_service import UserService
        user_service = UserService(get_data_dir())

    email = invite.get("email", "")
    roles = invite.get("roles", [])
    org_id = invite.get("org_id")

    user = user_service.create_user(
        username=username,
        email=email,
        password=password,
        roles=roles,
    )
    if not user:
        raise RuntimeError("Failed to create user account from invitation")

    if org_id:
        try:
            from services.org_service import add_member
            add_member(org_id=org_id, user_id=user.id, role=roles[0] if roles else "member")
        except Exception as e:
            logger.warning(f"Could not automatically add user to org {org_id}: {e}")

    now = time.time()
    invite["status"] = "claimed"
    invite["claimed_at"] = now
    invite["claimed_by_user_id"] = user.id
    kv.kv_set(SCOPE_INVITES, token, invite)

    return {
        "success": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "roles": getattr(user, "roles", []),
        },
        "invite": invite,
    }
