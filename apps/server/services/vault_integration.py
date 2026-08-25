"""HashiCorp Vault secret reader integration (UC631)."""
from __future__ import annotations

import json
import logging
import urllib.request
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def read_vault_secret(
    vault_addr: str,
    token: str,
    secret_path: str,
    timeout: int = 10,
) -> Dict[str, Any]:
    """Read secrets from HashiCorp Vault HTTP API (supporting KV v1 and KV v2) (UC631)."""
    addr = vault_addr.rstrip("/")
    path = secret_path.strip("/")
    url = f"{addr}/v1/{path}"

    req = urllib.request.Request(
        url,
        headers={
            "X-Vault-Token": token,
            "Content-Type": "application/json",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if "data" in data and isinstance(data["data"], dict) and "data" in data["data"]:
                return data["data"]["data"]
            if "data" in data and isinstance(data["data"], dict):
                return data["data"]
            return data
    except Exception as e:
        logger.error(f"Failed to read secrets from Vault at {url}: {e}")
        raise
