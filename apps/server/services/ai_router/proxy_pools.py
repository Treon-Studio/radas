"""Org egress proxy pools for the RADAS 9Router module.

Upstream 9Router routes provider egress through configurable HTTP proxy pools.
The RADAS equivalent: per-organization pools of http(s) proxy URLs (encrypted
at rest, credentials allowed inside the URL), sticky round-robin across active
pools, and proxy-bound gateway instances so every upstream call for that org
egresses through the pool. Tunnel/Tailscale and MITM traffic capture are
upstream-local-CLI deployment concepts and are intentionally not ported.
"""
from __future__ import annotations

import threading
import time
import urllib.request
from typing import Any, Optional

from storage import pg
from utils.secret_encryption import get_encryption

_ROTATION_LOCK = threading.Lock()
_ROTATION: dict[str, int] = {}
_GATEWAY_CACHE: dict[str, Any] = {}
_CACHE_LOCK = threading.Lock()


class ProxyPoolError(RuntimeError):
    def __init__(self, message: str, *, status: int = 400):
        super().__init__(message)
        self.status = status


def validate_proxy_url(proxy_url: str) -> str:
    url = (proxy_url or "").strip()
    if not url:
        raise ProxyPoolError("proxy_url is required")
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ProxyPoolError("proxy_url must be an http(s) proxy URL")
    return url.rstrip("/")


def list_pools(org_id: str) -> list[dict[str, Any]]:
    """Redacted pool metadata - the proxy URL (with any credentials) is never returned."""
    return pg.query_all(
        "SELECT id, label, is_active, created_at, updated_at "
        "FROM org_ai_proxy_pools WHERE org_id = %s ORDER BY created_at ASC",
        (org_id,),
    )


def upsert_pool(org_id: str, label: str, proxy_url: str) -> dict[str, Any]:
    label = (label or "").strip()[:120]
    if not label:
        raise ProxyPoolError("label is required")
    url = validate_proxy_url(proxy_url)
    now = time.time()
    encrypted = get_encryption().encrypt(url)
    existing = pg.query_one(
        "SELECT id FROM org_ai_proxy_pools WHERE org_id = %s AND label = %s",
        (org_id, label),
    )
    if existing:
        pg.execute(
            "UPDATE org_ai_proxy_pools SET proxy_url_encrypted = %s, is_active = TRUE, updated_at = %s WHERE id = %s",
            (encrypted, now, existing["id"]),
        )
        return {"id": existing["id"], "label": label}
    pool_id = f"pool-{time.time_ns() % 10**10:010d}"
    pg.execute(
        "INSERT INTO org_ai_proxy_pools (id, org_id, label, proxy_url_encrypted, is_active, created_at, updated_at) "
        "VALUES (%s, %s, %s, %s, TRUE, %s, %s)",
        (pool_id, org_id, label, encrypted, now, now),
    )
    return {"id": pool_id, "label": label}


def delete_pool(org_id: str, pool_id: str) -> bool:
    row = pg.query_one("SELECT 1 AS x FROM org_ai_proxy_pools WHERE id = %s AND org_id = %s", (pool_id, org_id))
    if not row:
        return False
    pg.execute("DELETE FROM org_ai_proxy_pools WHERE id = %s AND org_id = %s", (pool_id, org_id))
    return True


def resolve_proxy_url(org_id: str) -> Optional[str]:
    """Sticky round-robin across the org's active pools; None when empty."""
    rows = pg.query_all(
        "SELECT id, proxy_url_encrypted FROM org_ai_proxy_pools "
        "WHERE org_id = %s AND is_active = TRUE ORDER BY created_at ASC",
        (org_id,),
    )
    if not rows:
        return None
    if len(rows) > 1:
        with _ROTATION_LOCK:
            offset = _ROTATION.get(org_id, 0)
            _ROTATION[org_id] = (offset + 1) % len(rows)
        rows = rows[offset:] + rows[:offset]
    try:
        return get_encryption().decrypt(rows[0]["proxy_url_encrypted"])
    except Exception:
        return None


def gateway_with_proxy(proxy_url: str):
    """Proxy-bound gateway instance, cached per proxy URL."""
    from .gateway import OpenAIGateway

    with _CACHE_LOCK:
        cached = _GATEWAY_CACHE.get(proxy_url)
        if cached is None:
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url})
            )
            cached = OpenAIGateway(opener=opener)
            _GATEWAY_CACHE[proxy_url] = cached
        return cached
