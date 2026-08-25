"""Organization-scoped runtime connection metadata and health checks."""
from __future__ import annotations

import time
import uuid
from collections.abc import Mapping
from typing import Any

from psycopg.types.json import Jsonb

from services import runtime_registry
from storage import pg


class RuntimeConnectionError(ValueError):
    pass


def _member(org_id: str, actor_id: str | None, mutate: bool = False) -> dict[str, Any]:
    row = pg.query_one("SELECT role FROM org_members WHERE org_id=%s AND user_id=%s", (org_id, actor_id)) if actor_id else None
    if not row or (mutate and row["role"] not in {"owner", "admin"}):
        raise RuntimeConnectionError("organization access denied")
    return row


def _row(row: Mapping[str, Any]) -> dict[str, Any]:
    result = dict(row); result.pop("secret_id", None); return result


def list_connections(org_id: str, actor_id: str | None) -> list[dict[str, Any]]:
    _member(org_id, actor_id)
    return [_row(row) for row in pg.query_all("SELECT * FROM runtime_connections WHERE org_id=%s ORDER BY name", (org_id,))]


def create(org_id: str, actor_id: str | None, data: Mapping[str, Any]) -> dict[str, Any]:
    _member(org_id, actor_id, True)
    runtime_id = str(data.get("runtime_id") or "").strip()
    try: registry = runtime_registry.build_default_registry(); capabilities = registry.capabilities(runtime_id)
    except Exception as exc: raise RuntimeConnectionError("runtime is not registered") from exc
    name = str(data.get("name") or "").strip()
    if not name: raise RuntimeConnectionError("name is required")
    secret_id = str(data.get("secret_id") or "").strip() or None
    now = time.time()
    row = pg.query_one("INSERT INTO runtime_connections (id,org_id,name,runtime_id,secret_id,capabilities,configured,healthy,created_by,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,TRUE,FALSE,%s,%s,%s) RETURNING *", (str(uuid.uuid4()), org_id, name, runtime_id, secret_id, Jsonb(capabilities), actor_id, now, now))
    return _row(row)


def test_connection(org_id: str, connection_id: str, actor_id: str | None) -> dict[str, Any]:
    _member(org_id, actor_id)
    row = pg.query_one("SELECT * FROM runtime_connections WHERE id=%s AND org_id=%s", (connection_id, org_id))
    if not row: raise RuntimeConnectionError("runtime connection not found")
    try: runtime_registry.build_default_registry().require(row["runtime_id"])
    except Exception as exc: raise RuntimeConnectionError("runtime connection is unhealthy") from exc
    now = time.time(); updated = pg.query_one("UPDATE runtime_connections SET healthy=TRUE,last_tested_at=%s,last_error=NULL,updated_at=%s WHERE id=%s AND org_id=%s RETURNING *", (now, now, connection_id, org_id))
    return _row(updated)


def rotate(org_id: str, connection_id: str, actor_id: str | None, secret_id: str) -> dict[str, Any]:
    _member(org_id, actor_id, True)
    value = str(secret_id or "").strip()
    if not value: raise RuntimeConnectionError("secret_id is required")
    updated = pg.query_one("UPDATE runtime_connections SET secret_id=%s,rotated_at=%s,healthy=FALSE,updated_at=%s WHERE id=%s AND org_id=%s RETURNING *", (value, time.time(), time.time(), connection_id, org_id))
    if not updated: raise RuntimeConnectionError("runtime connection not found")
    return _row(updated)
