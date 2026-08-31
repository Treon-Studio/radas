"""Gateway endpoint API keys for the RADAS 9Router module.

Lets standard OpenAI-compatible clients authenticate against the RADAS gateway
without a RADAS JWT: they present an org-scoped key as a Bearer token or via
the X-Api-Key header. Raw keys are shown exactly once at creation; only a
SHA-256 hash is persisted.
"""
from __future__ import annotations

import hashlib
import secrets
import time
from typing import Any, Optional

from storage import pg

KEY_PREFIX = "radas_epk_"


def _hash(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def create_key(org_id: str, label: str = "") -> dict[str, Any]:
    raw_key = KEY_PREFIX + secrets.token_urlsafe(24)
    key_id = f"epk-{secrets.token_hex(6)}"
    pg.execute(
        "INSERT INTO org_ai_endpoint_keys (id, org_id, key_hash, key_prefix, label, is_active, created_at) "
        "VALUES (%s, %s, %s, %s, %s, TRUE, %s)",
        (key_id, org_id, _hash(raw_key), raw_key[:14], (label or "").strip(), time.time()),
    )
    return {"id": key_id, "key": raw_key, "key_prefix": raw_key[:14]}


def lookup(raw_key: str) -> Optional[dict[str, Any]]:
    """Resolve one presented key; returns the org-scoped row or None."""
    if not raw_key or not raw_key.startswith(KEY_PREFIX):
        return None
    row = pg.query_one(
        "SELECT id, org_id, label, is_active FROM org_ai_endpoint_keys WHERE key_hash = %s",
        (_hash(raw_key),),
    )
    if not row or not row["is_active"]:
        return None
    return dict(row)


def touch(key_id: str) -> None:
    try:
        pg.execute("UPDATE org_ai_endpoint_keys SET last_used_at = %s WHERE id = %s", (time.time(), key_id))
    except Exception:
        # Telemetry must never fail a gateway request.
        pass


def list_keys(org_id: str) -> list[dict[str, Any]]:
    """Key metadata only — never the hash and never the raw key."""
    return pg.query_all(
        "SELECT id, key_prefix, label, is_active, created_at, last_used_at "
        "FROM org_ai_endpoint_keys WHERE org_id = %s ORDER BY created_at DESC",
        (org_id,),
    )


def revoke(org_id: str, key_id: str) -> bool:
    row = pg.query_one("SELECT 1 AS x FROM org_ai_endpoint_keys WHERE id = %s AND org_id = %s", (key_id, org_id))
    if not row:
        return False
    pg.execute("DELETE FROM org_ai_endpoint_keys WHERE id = %s AND org_id = %s", (key_id, org_id))
    return True
