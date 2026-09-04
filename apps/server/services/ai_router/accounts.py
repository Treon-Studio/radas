"""Multi-account provider credentials for the RADAS 9Router module.

One provider can hold several API-key accounts (mirroring upstream 9Router's
multi-account model). Accounts carry a priority; equal-priority accounts are
served sticky round-robin. Credential resolution order per request:

1. active provider accounts (rotated),
2. the provider vault default key,
3. the provider environment variable (only when nothing is configured).
"""
from __future__ import annotations

import os
import threading
from typing import Any

from storage import pg
from utils.secret_encryption import get_encryption

_ROTATION_LOCK = threading.Lock()
_ROTATION: dict[tuple[str, str], int] = {}


def _decrypt(value: str) -> str:
    try:
        return get_encryption().decrypt(value)
    except Exception:
        # Legacy rows created before encrypted storage was introduced.
        return value


def list_accounts(org_id: str, provider_name: str) -> list[dict[str, Any]]:
    """Active accounts for one provider, ordered by priority then age."""
    return pg.query_all(
        "SELECT id, label, api_key_encrypted, base_url, priority FROM org_ai_provider_accounts "
        "WHERE org_id = %s AND provider_name = %s AND is_active = TRUE "
        "ORDER BY priority ASC, created_at ASC",
        (org_id, provider_name),
    )


def rotate(rows: list[dict[str, Any]], org_id: str, provider_name: str) -> list[dict[str, Any]]:
    """Sticky round-robin among the top-priority accounts only.

    Rows arrive sorted by (priority, created_at). Accounts sharing the best
    priority rotate per call; lower-priority accounts keep their order as
    later fallback candidates.
    """
    if len(rows) <= 1:
        return list(rows)
    top_priority = rows[0].get("priority")
    leaders = [row for row in rows if row.get("priority") == top_priority]
    rest = [row for row in rows if row.get("priority") != top_priority]
    if len(leaders) > 1:
        key = (org_id, provider_name)
        with _ROTATION_LOCK:
            offset = _ROTATION.get(key, 0)
            _ROTATION[key] = (offset + 1) % len(leaders)
        leaders = leaders[offset:] + leaders[:offset]
    return leaders + rest


def gather_credentials(org_id: str, provider_name: str, env_var: str = "") -> list[dict[str, Any]]:
    """Ordered candidate credentials for one upstream provider call."""
    credentials: list[dict[str, Any]] = []
    accounts = rotate(list_accounts(org_id, provider_name), org_id, provider_name)
    for row in accounts:
        key = _decrypt(row.get("api_key_encrypted") or "")
        if key:
            credentials.append({"api_key": key, "base_url": row.get("base_url") or ""})
    if not credentials:
        provider = pg.query_one(
            "SELECT api_key_encrypted, base_url FROM org_ai_providers "
            "WHERE org_id = %s AND provider_name = %s AND is_active = TRUE",
            (org_id, provider_name),
        )
        if provider:
            key = _decrypt(provider.get("api_key_encrypted") or "")
            if key:
                credentials.append({"api_key": key, "base_url": provider.get("base_url") or ""})
    if not credentials:
        # OAuth accounts rank ahead of environment fallbacks: they represent
        # explicitly connected org credentials, not ambient host config.
        try:
            from .oauth import get_valid_access_token, oauth_provider_name

            oauth_name = oauth_provider_name(provider_name)
            token = get_valid_access_token(org_id, oauth_name) if oauth_name else None
        except Exception:
            token = None
        if token:
            credentials.append({"api_key": token, "base_url": ""})
    if not credentials and env_var:
        key = os.environ.get(env_var)
        if key:
            credentials.append({"api_key": key, "base_url": ""})
    return credentials
