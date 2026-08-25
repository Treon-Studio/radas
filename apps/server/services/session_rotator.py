"""Automatic rolling JWT session token rotator (UC490)."""
from __future__ import annotations

import datetime
import hashlib
import logging
from pathlib import Path
from typing import Any, Dict, Optional
import uuid

from auth.service import generate_token
from storage import pg

logger = logging.getLogger(__name__)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def rotate_session_token(
    current_refresh_token: str,
    user_id: str,
    client_ip: str = "127.0.0.1",
    data_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Rotate JWT session tokens in a sliding window, invalidating old refresh tokens (UC490)."""
    now_iso = datetime.datetime.now(datetime.UTC).isoformat()
    clean_token = current_refresh_token.strip()
    r_hash = hash_token(clean_token)

    # Invalidate previous session with this refresh token
    pg.execute(
        "UPDATE sessions SET revoked_at = %s WHERE refresh_hash = %s AND revoked_at IS NULL",
        (now_iso, r_hash),
    )

    # Resolve user details if available
    user_row = pg.query_one("SELECT username FROM users WHERE id = %s", (user_id,))
    username = user_row["username"] if user_row else user_id

    d_dir = data_dir or Path("/tmp/radas_auth")
    nonce = uuid.uuid4().hex
    new_access = generate_token(
        user_id=user_id,
        username=username,
        roles=["viewer"],
        data_dir=d_dir,
        token_type="access",
        extra_claims={"nonce": nonce},
    )
    new_refresh = generate_token(
        user_id=user_id,
        username=username,
        roles=["viewer"],
        data_dir=d_dir,
        token_type="refresh",
        extra_claims={"nonce": nonce},
    )

    new_hash = hash_token(new_refresh)
    session_id = str(uuid.uuid4())

    pg.execute(
        "INSERT INTO sessions (id, user_id, refresh_hash, ip, created_at) "
        "VALUES (%s, %s, %s, %s, %s)",
        (session_id, user_id, new_hash, client_ip, now_iso),
    )

    logger.info(f"Successfully rotated JWT session for user {user_id} (session_id={session_id})")

    return {
        "success": True,
        "session_id": session_id,
        "access_token": new_access,
        "refresh_token": new_refresh,
        "expires_in": 3600,
    }
