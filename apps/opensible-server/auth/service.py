#!/usr/bin/env python3
"""
JWT authentication token utilities.

Security notes:
- JWT_SECRET_KEY MUST be set via environment variable in production. In a
  non-production environment a random ephemeral key is generated at process
  start (tokens are invalidated on restart) and a loud warning is logged.
- The token blacklist now stores each token with its *real* `exp` claim, so
  revoked tokens cannot become valid again after the blacklist purges them.
- `decode_token_unsafe()` (formerly `decode_token`) NEVER verifies the
  signature and MUST NOT be used for any authorization decision.
"""
import os
import jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from pathlib import Path
import json
import logging
import threading

from utils.runtime_secrets import resolve_secret

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Secret key resolution (fail-hard in production)
# ---------------------------------------------------------------------------
# Development/test may use a per-process key. Production must explicitly set
# JWT_SECRET_KEY; the legacy alias is retained only for non-production users.
JWT_SECRET_KEY = resolve_secret(
    "JWT_SECRET_KEY", aliases=("JWT_SECRET",), generate_in_nonproduction=True
)
if not JWT_SECRET_KEY:  # defensive: resolve_secret should only return this in dev
    raise RuntimeError("JWT_SECRET_KEY is required to initialize authentication")

if len(JWT_SECRET_KEY) < 32:
    logger.warning("JWT_SECRET_KEY is shorter than 32 chars — insecure outside production.")
JWT_ALGORITHM = 'HS256'
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('JWT_ACCESS_TOKEN_EXPIRE_MINUTES', '1440'))
JWT_REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get('JWT_REFRESH_TOKEN_EXPIRE_DAYS', '7'))

# ---------------------------------------------------------------------------
# Token blacklist (file-backed with in-process lock)
# ---------------------------------------------------------------------------
_blacklist_lock = threading.Lock()


def get_token_blacklist_path(data_dir: Path) -> Path:
    auth_dir = data_dir / 'auth'
    auth_dir.mkdir(exist_ok=True)
    return auth_dir / 'token_blacklist.json'


def load_token_blacklist(data_dir: Path) -> dict:
    """Load blacklist as {token: exp_ts}. Purges expired entries on read."""
    blacklist_file = get_token_blacklist_path(data_dir)
    if not blacklist_file.exists():
        return {}
    try:
        with open(blacklist_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, dict):
            # Legacy format (list/set) — drop it; expired entries either way
            return {}
        now = datetime.utcnow().timestamp()
        active = {t: float(exp) for t, exp in data.items() if float(exp) > now}
        if len(active) != len(data):
            _write_blacklist(blacklist_file, active)
        return active
    except Exception as e:
        logger.error(f"Error loading token blacklist: {e}")
        return {}


def _write_blacklist(blacklist_file: Path, data: dict) -> None:
    tmp = blacklist_file.with_suffix(blacklist_file.suffix + '.tmp')
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, blacklist_file)


def save_token_blacklist(data_dir: Path, blacklist: dict):
    """Persist {token: exp_ts} dict to disk."""
    blacklist_file = get_token_blacklist_path(data_dir)
    try:
        _write_blacklist(blacklist_file, blacklist)
    except Exception as e:
        logger.error(f"Error saving token blacklist: {e}")


def _extract_exp(token: str) -> float:
    """Best-effort extraction of the `exp` claim. Falls back to refresh expiry."""
    try:
        payload = jwt.decode(
            token, JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={'verify_exp': False},
        )
        exp = payload.get('exp')
        if exp:
            return float(exp)
    except Exception:
        pass
    return (datetime.utcnow() + timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS)).timestamp()


def add_token_to_blacklist(data_dir: Path, token: str):
    """Add token to blacklist with its real exp. Thread-safe."""
    with _blacklist_lock:
        blacklist = load_token_blacklist(data_dir)
        blacklist[token] = _extract_exp(token)
        save_token_blacklist(data_dir, blacklist)


def is_token_blacklisted(data_dir: Path, token: str) -> bool:
    blacklist = load_token_blacklist(data_dir)
    return token in blacklist


# ---------------------------------------------------------------------------
# User session revocations (UC635)
# ---------------------------------------------------------------------------
_revocation_lock = threading.Lock()


def get_user_session_revocations_path(data_dir: Path) -> Path:
    auth_dir = data_dir / 'auth'
    auth_dir.mkdir(exist_ok=True)
    return auth_dir / 'session_revocations.json'


def load_user_session_revocations(data_dir: Path) -> dict:
    path = get_user_session_revocations_path(data_dir)
    if not path.exists():
        return {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        logger.error(f"Error loading session revocations: {e}")
        return {}


def save_user_session_revocations(data_dir: Path, revocations: dict) -> None:
    path = get_user_session_revocations_path(data_dir)
    try:
        tmp = path.with_suffix(path.suffix + '.tmp')
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(revocations, f, indent=2)
        os.replace(tmp, path)
    except Exception as e:
        logger.error(f"Error saving session revocations: {e}")


def revoke_all_user_sessions(user_id: str, data_dir: Path) -> int:
    """Revoke all current sessions and tokens for a user by setting a cutoff timestamp."""
    import time
    now = int(time.time())
    with _revocation_lock:
        revocations = load_user_session_revocations(data_dir)
        revocations[user_id] = now
        save_user_session_revocations(data_dir, revocations)

    try:
        from storage import pg
        pg.execute(
            "UPDATE sessions SET revoked_at = %s WHERE user_id = %s AND revoked_at IS NULL",
            (datetime.utcnow().isoformat(), user_id),
        )
    except Exception:
        pass

    logger.info(f"Revoked all sessions for user {user_id} (cutoff={now})")
    return now


def are_user_sessions_revoked(user_id: str, iat: Any, data_dir: Path) -> bool:
    """Check if a token's iat timestamp is earlier than or equal to the user's session revocation cutoff."""
    if not user_id:
        return False
    revocations = load_user_session_revocations(data_dir)
    cutoff = revocations.get(user_id)
    if cutoff is None:
        return False

    iat_ts = iat
    if isinstance(iat, datetime):
        iat_ts = iat.timestamp()
    elif isinstance(iat, (int, float, str)):
        try:
            iat_ts = float(iat)
        except ValueError:
            return False

    return int(iat_ts) <= int(cutoff)


# ---------------------------------------------------------------------------
# Token generation / verification
# ---------------------------------------------------------------------------
def generate_token(user_id: str, username: str, roles: list, data_dir: Path,
                   token_type: str = 'access', expires_delta: Optional[timedelta] = None,
                   org_id: Optional[str] = None) -> str:
    if expires_delta is None:
        if token_type == 'refresh':
            expires_delta = timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        else:
            expires_delta = timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.utcnow() + expires_delta
    payload = {
        'user_id': user_id,
        'username': username,
        'roles': roles,
        'token_type': token_type,
        'exp': expire,
        'iat': datetime.utcnow(),
    }
    if org_id:
        payload['org_id'] = org_id
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_token(token: str, data_dir: Path, token_type: str = 'access') -> Optional[Dict[str, Any]]:
    """Verify signature, expiry, blacklist, and token_type."""
    try:
        if is_token_blacklisted(data_dir, token):
            logger.warning("Attempt to use blacklisted token")
            return None
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get('token_type') != token_type:
            logger.warning(f"Invalid token type. Expected {token_type}, got {payload.get('token_type')}")
            return None
        user_id = payload.get('user_id')
        iat = payload.get('iat')
        if user_id and iat is not None and are_user_sessions_revoked(user_id, iat, data_dir):
            logger.warning(f"Token for user {user_id} revoked by session revocation cutoff")
            return None
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        return None
    except Exception as e:
        logger.error(f"Error verifying token: {e}")
        return None


def decode_token_unsafe(token: str) -> Optional[Dict[str, Any]]:
    """
    SECURITY: Decode a JWT WITHOUT verifying signature or expiry.

    Returns payload for display purposes only. NEVER use this for
    authorization, role checks, or any security decision.
    """
    try:
        # Pin algorithm even when skipping signature verification.
        return jwt.decode(
            token,
            options={'verify_signature': False, 'verify_exp': False},
            algorithms=[JWT_ALGORITHM],
        )
    except Exception as e:
        logger.warning(f"Error decoding token: {e}")
        return None


# Back-compat alias — DO NOT use for authorization decisions.
decode_token = decode_token_unsafe


def get_token_from_header(auth_header: Optional[str]) -> Optional[str]:
    if not auth_header:
        return None
    try:
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            return None
        return parts[1]
    except Exception:
        return None
