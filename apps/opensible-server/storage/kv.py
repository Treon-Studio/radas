"""Generic key-value JSON store over Postgres (Fase 7 — C1).

Maps the legacy per-service JSON files (`feature_flags.json`, `quotas.json`,
...) onto the `kv_store(scope, key, value jsonb)` table so the many
config-style services keep their shape (list of records / dict keyed by id)
while storage moves to Postgres.

Conventions per service scope:
  - list-style  : key = "default" (or "list"), value = the whole list
  - dict-style  : one row per entry, key = entry id, value = the entry
Helpers expose both: `kv_get/kv_set` (single key) and `kv_load/kv_save`
(detect dict vs list for the whole scope).
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

from storage import pg


def kv_get(scope: str, key: str = "default") -> Optional[Any]:
    row = pg.query_one("SELECT value FROM kv_store WHERE scope = %s AND key = %s",
                       (scope, key))
    return row["value"] if row else None


def kv_set(scope: str, key: str, value: Any, updated_at: Optional[float] = None) -> None:
    pg.execute(
        "INSERT INTO kv_store (scope, key, value, updated_at) VALUES (%s,%s,%s,%s) "
        "ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, "
        "updated_at = EXCLUDED.updated_at",
        (scope, key, json.dumps(value), updated_at if updated_at is not None else time.time()),
    )


def kv_delete(scope: str, key: str = "default") -> bool:
    cur = pg.execute("DELETE FROM kv_store WHERE scope = %s AND key = %s", (scope, key))
    return True


def kv_list(scope: str) -> List[Dict[str, Any]]:
    """Return all rows as [{key, value}] for a scope."""
    rows = pg.query_all("SELECT key, value FROM kv_store WHERE scope = %s ORDER BY key", (scope,))
    return [{"key": r["key"], "value": r["value"]} for r in rows]


def kv_keys(scope: str) -> List[str]:
    rows = pg.query_all("SELECT key FROM kv_store WHERE scope = %s ORDER BY key", (scope,))
    return [r["key"] for r in rows]


def kv_list_scopes(prefix: str = "") -> List[str]:
    """List distinct scopes, optionally restricted to a prefix."""
    if prefix:
        rows = pg.query_all(
            "SELECT DISTINCT scope FROM kv_store WHERE scope LIKE %s ORDER BY scope",
            (f"{prefix}%",),
        )
    else:
        rows = pg.query_all("SELECT DISTINCT scope FROM kv_store ORDER BY scope")
    return [r["scope"] for r in rows]


# ---------------------------------------------------------------------------
# Whole-scope load/save (auto-detect list vs dict)
# ---------------------------------------------------------------------------

def kv_load(scope: str) -> Any:
    """Load a whole scope: returns a list if it was saved as a list under
    key 'default', else a dict keyed by entry key."""
    rows = kv_list(scope)
    if not rows:
        return []
    # Legacy list-style: single 'default' key holding a list.
    if len(rows) == 1 and rows[0]["key"] == "default" and isinstance(rows[0]["value"], list):
        return rows[0]["value"]
    return {r["key"]: r["value"] for r in rows}


def kv_save(scope: str, value: Any) -> None:
    """Save a whole scope. Lists -> one 'default' row. Dicts -> one row per key.
    Existing keys not present in the new dict are removed."""
    existing = set(kv_keys(scope))
    if isinstance(value, dict):
        for k in list(existing):
            if k not in value:
                kv_delete(scope, k)
        for k, v in value.items():
            kv_set(scope, str(k), v)
    else:
        kv_delete(scope, "default")
        kv_set(scope, "default", value)
