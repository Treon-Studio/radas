"""Existing infrastructure resource importer syntax generator and validator (UC525)."""
from __future__ import annotations

import logging
from typing import Dict

logger = logging.getLogger(__name__)


def generate_import_command(
    resource_address: str,
    cloud_id: str,
    provider: str = "aws",
) -> Dict[str, str]:
    """Generate and validate OpenTofu CLI resource import command (UC525)."""
    addr = resource_address.strip()
    cid = cloud_id.strip()

    if "." not in addr:
        raise ValueError(f"Invalid resource address format '{addr}'. Expected 'type.name'")

    rtype, rname = addr.split(".", 1)
    cmd = f"tofu import {addr} {cid}"

    logger.info(f"Generated import command for {addr} -> {cid}")

    return {
        "command": cmd,
        "resource_address": addr,
        "resource_type": rtype,
        "resource_name": rname,
        "cloud_id": cid,
        "provider": provider.lower().strip(),
    }
