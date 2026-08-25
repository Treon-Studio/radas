"""OpenTofu / Terraform lockfile (.terraform.lock.hcl) parser and verifier (UC514)."""
from __future__ import annotations

import re
from typing import Any, Dict, List


def parse_terraform_lockfile(content: str) -> Dict[str, Any]:
    """Parse .terraform.lock.hcl and extract provider pins, versions, and hashes (UC514)."""
    providers: Dict[str, Dict[str, Any]] = {}
    if not content:
        return {"providers": providers}

    provider_blocks = re.findall(
        r'provider\s+"([^"]+)"\s+\{([^}]+)\}',
        content,
        re.MULTILINE | re.DOTALL,
    )

    for prov_name, body in provider_blocks:
        version_match = re.search(r'version\s*=\s*"([^"]+)"', body)
        constraints_match = re.search(r'constraints\s*=\s*"([^"]+)"', body)
        hashes = re.findall(r'"([^"]+)"', body[body.find("hashes"):] if "hashes" in body else "")

        providers[prov_name] = {
            "version": version_match.group(1) if version_match else None,
            "constraints": constraints_match.group(1) if constraints_match else None,
            "hashes": hashes,
        }

    return {"providers": providers}
