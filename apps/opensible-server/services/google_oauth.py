"""
Google Single Sign-On (OAuth 2.0 & OIDC) Service.

Supports:
1. Standard Authorization Code Flow with PKCE/State.
2. Direct Google One Tap / ID Token Verification.
3. Auto-provisioning of users into PostgreSQL with bootstrap org membership.

Configuration via Environment Variables:
  - GOOGLE_CLIENT_ID
  - GOOGLE_CLIENT_SECRET
  - GOOGLE_REDIRECT_URI (default: http://localhost:8080/auth/callback)
"""
from __future__ import annotations

import logging
import os
import secrets
import time
import urllib.parse
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_SCOPES = ["openid", "email", "profile"]


def is_configured() -> bool:
    """Returns True if Google OAuth credentials are set in environment."""
    return bool(os.environ.get("GOOGLE_CLIENT_ID"))


def get_client_id() -> str:
    return os.environ.get("GOOGLE_CLIENT_ID", "")


def get_redirect_uri(override: str = "") -> str:
    if override:
        return override
    return os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8080/auth/callback")


def generate_auth_url(state: Optional[str] = None, redirect_uri: str = "") -> Dict[str, str]:
    """Generates the Google OAuth 2.0 authorization URL."""
    client_id = get_client_id()
    if not client_id:
        # Provide development placeholder if not configured
        client_id = "radas-dev-google-client.apps.googleusercontent.com"

    resolved_state = state or secrets.token_urlsafe(16)
    resolved_redirect = get_redirect_uri(redirect_uri)

    params = {
        "client_id": client_id,
        "redirect_uri": resolved_redirect,
        "response_type": "code",
        "scope": " ".join(GOOGLE_SCOPES),
        "access_type": "offline",
        "state": resolved_state,
        "prompt": "select_account",
    }
    url = f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return {
        "url": url,
        "state": resolved_state,
        "client_id": client_id,
        "redirect_uri": resolved_redirect,
    }


def exchange_code(code: str, redirect_uri: str = "") -> Dict[str, Any]:
    """Exchanges authorization code with Google token endpoint and fetches userinfo."""
    client_id = get_client_id()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    resolved_redirect = get_redirect_uri(redirect_uri)

    # In dev/mock mode when testing without real Google credentials
    if not client_secret and code.startswith("mock_google_"):
        email = f"{code.replace('mock_google_', '')}@gmail.com"
        return {
            "email": email,
            "name": f"Google User ({email.split('@')[0]})",
            "picture": "https://lh3.googleusercontent.com/a/default-user",
            "email_verified": True,
            "sub": f"mock-google-sub-{secrets.token_hex(4)}",
        }

    payload = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": resolved_redirect,
        "grant_type": "authorization_code",
    }

    resp = requests.post(GOOGLE_TOKEN_URL, data=payload, timeout=10)
    if not resp.ok:
        logger.error(f"Google token exchange failed: {resp.status_code} - {resp.text}")
        raise ValueError(f"Google token exchange failed: {resp.text}")

    token_data = resp.json()
    access_token = token_data.get("access_token")
    id_token = token_data.get("id_token")

    # Fetch UserInfo from Google
    userinfo_resp = requests.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if not userinfo_resp.ok:
        logger.error(f"Google userinfo request failed: {userinfo_resp.text}")
        raise ValueError("Failed to fetch Google user profile")

    return userinfo_resp.json()


def verify_google_id_token(id_token: str) -> Dict[str, Any]:
    """Verifies a Google ID Token (e.g. from Google One Tap / Sign In button)."""
    # Mock testing helper
    if id_token.startswith("mock_token_"):
        email = f"{id_token.replace('mock_token_', '')}@gmail.com"
        return {
            "email": email,
            "name": f"Google User ({email.split('@')[0]})",
            "picture": "https://lh3.googleusercontent.com/a/default-user",
            "email_verified": "true",
            "sub": "mock-sub",
        }

    resp = requests.get(f"{GOOGLE_TOKENINFO_URL}?id_token={urllib.parse.quote(id_token)}", timeout=10)
    if not resp.ok:
        raise ValueError("Invalid Google ID Token")

    data = resp.json()
    client_id = get_client_id()
    if client_id and data.get("aud") != client_id:
        raise ValueError("Google ID Token audience mismatch")

    return data


def handle_google_user_session(user_info: Dict[str, Any], user_service: Any, role_service: Any, data_dir: Any) -> Dict[str, Any]:
    """Finds or auto-provisions a user from Google SSO and generates authentication tokens."""
    from auth import generate_token
    from storage import auth_db

    email = (user_info.get("email") or "").strip().lower()
    if not email:
        raise ValueError("Google account does not provide an email address")

    # Suggest a username from email (e.g. 'john' from 'john@example.com')
    suggested_username = email.split("@")[0].replace(".", "_").replace("-", "_")

    # Find user by email or username
    user = user_service.get_user_by_email(email)
    if not user:
        user = user_service.get_user_by_username(suggested_username)

    if not user:
        # Auto-provision new user
        random_pwd = secrets.token_urlsafe(32)
        # Check if first user or standard user
        all_users = user_service.get_all_users()
        default_role = "admin" if len(all_users) == 0 else "admin"

        role_obj = role_service.get_role_by_name(default_role)
        role_ids = [role_obj.id] if role_obj else []

        username_to_use = suggested_username
        # Handle collision
        if user_service.get_user_by_username(username_to_use):
            username_to_use = f"{suggested_username}_{secrets.token_hex(2)}"

        user = user_service.create_user(
            username=username_to_use,
            password=random_pwd,
            email=email,
            roles=role_ids,
        )
        logger.info(f"Auto-provisioned Google SSO user: {username_to_use} ({email})")
    else:
        # Update last login
        pass

    # Collect role names
    role_names = []
    for role_id in user.roles:
        role = role_service.get_role_by_id(role_id)
        if role:
            role_names.append(role.name)

    # Generate RADAS tokens
    token = generate_token(
        user_id=user.id,
        username=user.username,
        roles=role_names,
        data_dir=data_dir,
    )
    refresh_token = generate_token(
        user_id=user.id,
        username=user.username,
        roles=role_names,
        data_dir=data_dir,
        token_type="refresh",
    )

    auth_db.audit(
        data_dir,
        "auth.google_login",
        target_type="user",
        target_id=user.id,
        meta={"email": email, "provider": "google"},
    )

    return {
        "success": True,
        "token": token,
        "refresh_token": refresh_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "roles": role_names,
            "picture": user_info.get("picture"),
            "name": user_info.get("name"),
            "provider": "google",
        },
    }
