"""IP Allowlist policy enforcer per organization / project (UC422)."""
from __future__ import annotations

import ipaddress
import logging
from typing import List, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

IP_ALLOWLIST_SCOPE = "ip_allowlists"


def set_org_ip_allowlist(org_id: str, allowed_cidrs: List[str]) -> None:
    """Configure allowed IP CIDR blocks for an organization (UC422)."""
    clean_cidrs = [str(c).strip() for c in allowed_cidrs if str(c).strip()]
    kv_set(IP_ALLOWLIST_SCOPE, org_id, clean_cidrs)
    logger.info(f"Updated IP allowlist for org '{org_id}' ({len(clean_cidrs)} CIDRs)")


def get_org_ip_allowlist(org_id: str) -> List[str]:
    """Retrieve allowed IP CIDR blocks for an organization."""
    val = kv_get(IP_ALLOWLIST_SCOPE, org_id)
    return list(val) if isinstance(val, list) else []


def is_ip_allowed(ip_address: str, org_id: Optional[str] = None) -> bool:
    """Check if incoming client IP address satisfies org allowlist policy (UC422)."""
    if not org_id:
        return True

    allowed_cidrs = get_org_ip_allowlist(org_id)
    if not allowed_cidrs:
        return True

    try:
        client_ip = ipaddress.ip_address(ip_address.strip())
    except ValueError:
        logger.warning(f"Invalid IP address format: {ip_address}")
        return False

    for cidr in allowed_cidrs:
        try:
            network = ipaddress.ip_network(cidr.strip(), strict=False)
            if client_ip in network:
                return True
        except ValueError:
            continue

    logger.warning(f"Access denied for IP {ip_address} against org '{org_id}' allowlist")
    return False
