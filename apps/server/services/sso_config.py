"""OAuth login and SSO discovery configuration service (UC627, UC628)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from storage.kv import kv_delete, kv_get, kv_list, kv_set

logger = logging.getLogger(__name__)

KV_SCOPE = "sso_providers"


def set_sso_discovery_config(
    provider_name: str,
    discovery_url: str,
    client_id: str,
    client_secret: Optional[str] = None,
    scopes: Optional[List[str]] = None,
) -> None:
    """Save or update an SSO/OAuth provider discovery configuration (UC627, UC628)."""
    pname = (provider_name or "").strip().lower()
    if not pname:
        raise ValueError("provider_name is required")

    existing = kv_get(KV_SCOPE, pname) or {}
    secret = client_secret if client_secret is not None else existing.get("client_secret", "")

    payload = {
        "provider_name": pname,
        "discovery_url": (discovery_url or "").strip(),
        "client_id": (client_id or "").strip(),
        "client_secret": secret,
        "scopes": scopes or ["openid", "email", "profile"],
        "updated_at": time.time(),
    }
    kv_set(KV_SCOPE, pname, payload)
    logger.info(f"Saved SSO configuration for provider '{pname}'")


def get_sso_discovery_config(provider_name: str, mask_secret: bool = True) -> Optional[Dict[str, Any]]:
    """Retrieve an SSO configuration by provider name."""
    pname = (provider_name or "").strip().lower()
    conf = kv_get(KV_SCOPE, pname)
    if not conf or not isinstance(conf, dict):
        return None

    res = dict(conf)
    if mask_secret and res.get("client_secret"):
        res["client_secret"] = "********"
    return res


def list_configured_sso_providers(mask_secret: bool = True) -> List[Dict[str, Any]]:
    """List all configured SSO/OAuth providers."""
    records = kv_list(KV_SCOPE)
    providers = []
    for r in records:
        val = r.get("value")
        if isinstance(val, dict):
            item = dict(val)
            if mask_secret and item.get("client_secret"):
                item["client_secret"] = "********"
            providers.append(item)
    return providers


def delete_sso_config(provider_name: str) -> bool:
    """Remove a configured SSO provider."""
    pname = (provider_name or "").strip().lower()
    return kv_delete(KV_SCOPE, pname)
