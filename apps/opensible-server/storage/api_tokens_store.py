#!/usr/bin/env python3
"""
API Tokens store — long-lived tokens for programmatic API access.
Tokens are hashed; plaintext is returned only once at creation.
All operations are stored in PostgreSQL kv_store with thread-safe ACID transactions.
"""
import uuid
import time
import logging
import hashlib
import secrets
from typing import Optional, Dict, List, Tuple
from storage import pg

logger = logging.getLogger(__name__)

SCOPE_NAME = "api_tokens"


def _hash_token(token: str, salt: str) -> str:
    return hashlib.sha256((token + salt).encode('utf-8')).hexdigest()


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


def _generate_salt() -> str:
    return secrets.token_urlsafe(16)


def _load_tokens(conn) -> List[Dict]:
    row = conn.execute("SELECT value FROM kv_store WHERE scope = %s AND key = %s", (SCOPE_NAME, "list")).fetchone()
    if row:
        val = row["value"] if isinstance(row, dict) else row[0]
        return val if isinstance(val, list) else []
    return []


def _save_tokens(conn, tokens: List[Dict]) -> None:
    import json
    conn.execute(
        "INSERT INTO kv_store (scope, key, value, updated_at) VALUES (%s,%s,%s,%s) "
        "ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at",
        (SCOPE_NAME, "list", json.dumps(tokens), time.time()),
    )


def list_tokens(user_id: str) -> List[Dict]:
    """List API tokens for a user. Never returns token value."""
    with pg.transaction() as conn:
        tokens = _load_tokens(conn)
    
    result = []
    for t in tokens:
        if t.get('userId') != user_id:
            continue
        result.append({
            'id': t.get('id'),
            'name': t.get('name'),
            'scope': t.get('scope', 'global'),
            'projectId': t.get('projectId'),
            'createdAt': t.get('createdAt'),
            'lastUsedAt': t.get('lastUsedAt'),
            'expiresAt': t.get('expiresAt'),
            'status': 'revoked' if t.get('revoked') else 'active',
        })
    return result


def create_token(
    user_id: str,
    username: str,
    name: str,
    scope: str = 'global',
    project_id: Optional[str] = None,
    expires_days: Optional[int] = None,
    roles: Optional[List[str]] = None,
) -> Tuple[str, str]:
    """
    Create API token. Returns (token_id, plaintext_token).
    Plaintext is returned only once!
    """
    token_id = str(uuid.uuid4())
    plaintext = _generate_token()
    salt = _generate_salt()
    token_hash = _hash_token(plaintext, salt)

    now = time.time()
    expires_at = None
    if expires_days and expires_days > 0:
        expires_at = now + (expires_days * 86400)

    entry = {
        'id': token_id,
        'name': name,
        'scope': scope,
        'projectId': project_id if scope == 'project' else None,
        'userId': user_id,
        'username': username,
        'tokenHash': token_hash,
        'tokenSalt': salt,
        'createdAt': now,
        'lastUsedAt': None,
        'expiresAt': expires_at,
        'roles': roles or [],
        'revoked': False,
    }

    with pg.transaction() as conn:
        tokens = _load_tokens(conn)
        tokens.append(entry)
        _save_tokens(conn, tokens)

    logger.info(f"Created API token {token_id} for user {user_id}")
    return token_id, plaintext


def verify_api_token(token: str) -> Optional[Tuple[str, Dict]]:
    """
    Verify API token. Returns (user_id, token_entry) if valid.
    Updates lastUsedAt.
    """
    now = time.time()
    matched_user_id = None
    matched_token = None

    with pg.transaction() as conn:
        tokens = _load_tokens(conn)
        for t in tokens:
            if t.get('revoked'):
                continue
            exp = t.get('expiresAt')
            if exp and now > exp:
                continue
            if t.get('tokenHash') and t.get('tokenSalt'):
                h = _hash_token(token, t['tokenSalt'])
                if h == t['tokenHash']:
                    t['lastUsedAt'] = now
                    matched_user_id = t.get('userId')
                    matched_token = t
                    _save_tokens(conn, tokens)
                    break

    if matched_user_id and matched_token:
        return matched_user_id, matched_token
    return None


def revoke_token(token_id: str, user_id: str) -> bool:
    """Revoke token. User can only revoke own tokens."""
    revoked = False
    with pg.transaction() as conn:
        tokens = _load_tokens(conn)
        for t in tokens:
            if t.get('id') == token_id and t.get('userId') == user_id:
                t['revoked'] = True
                revoked = True
                _save_tokens(conn, tokens)
                break
    return revoked


def rotate_token(token_id: str, user_id: str) -> Optional[Tuple[str, str]]:
    """
    Regenerate token: create new token, revoke old. Returns (new_token_id, plaintext) or None.
    Plaintext returned only once!
    """
    old_token_found = False
    expires_days = None
    old_token_info = {}

    with pg.transaction() as conn:
        tokens = _load_tokens(conn)
        for t in tokens:
            if t.get('id') == token_id and t.get('userId') == user_id and not t.get('revoked'):
                t['revoked'] = True
                old_token_found = True
                old_token_info = t
                _save_tokens(conn, tokens)
                break

    if old_token_found:
        exp = old_token_info.get('expiresAt')
        if exp and exp > time.time():
            expires_days = int((exp - time.time()) / 86400)
            
        new_id, plaintext = create_token(
            user_id=user_id,
            username=old_token_info.get('username', ''),
            name=old_token_info.get('name', ''),
            scope=old_token_info.get('scope', 'global'),
            project_id=old_token_info.get('projectId'),
            expires_days=expires_days,
        )
        return new_id, plaintext
    return None


def delete_token(token_id: str, user_id: str) -> bool:
    """Delete token. User can only delete own tokens."""
    deleted = False
    with pg.transaction() as conn:
        tokens = _load_tokens(conn)
        new_tokens = [t for t in tokens if not (t.get('id') == token_id and t.get('userId') == user_id)]
        if len(new_tokens) != len(tokens):
            deleted = True
            _save_tokens(conn, new_tokens)
    return deleted
