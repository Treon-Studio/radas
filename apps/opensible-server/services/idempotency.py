"""
Idempotency service (UC405) — Idempotent API Keys and Mutation Deduplication.
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, Optional


def check_idempotency_key(key: str, scope: str = "global") -> Optional[Dict[str, Any]]:
    """Check if an idempotency key has already been executed within a given scope."""
    if not key:
        return None

    clean_key = str(key).strip()
    clean_scope = f"idempotency:{scope or 'global'}"

    try:
        from storage import pg
        row = pg.query_one(
            "SELECT value FROM kv_store WHERE scope = %s AND key = %s",
            (clean_scope, clean_key)
        )
        if row and row.get("value"):
            val = row["value"]
            if isinstance(val, str):
                try:
                    val = json.loads(val)
                except Exception:
                    pass
            if isinstance(val, dict):
                return val
    except Exception:
        pass
    return None


def save_idempotency_result(
    key: str,
    scope: str = "global",
    status_code: int = 200,
    response_body: Any = None,
    headers: Optional[Dict[str, str]] = None,
    ttl_seconds: int = 86400,
) -> Dict[str, Any]:
    """Store the resulting response of an idempotent request."""
    if not key:
        return {}

    clean_key = str(key).strip()
    clean_scope = f"idempotency:{scope or 'global'}"
    now = int(time.time())

    payload = {
        "key": clean_key,
        "scope": scope,
        "status_code": status_code,
        "response_body": response_body,
        "headers": headers or {},
        "created_at": now,
        "expires_at": now + ttl_seconds,
    }

    try:
        from storage import pg
        pg.execute(
            "INSERT INTO kv_store (scope, key, value) VALUES (%s, %s, %s) "
            "ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value",
            (clean_scope, clean_key, json.dumps(payload))
        )
    except Exception:
        pass

    return payload
