"""Ansible dynamic host inventory provider (UC385)."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from storage import pg

logger = logging.getLogger(__name__)


def generate_dynamic_inventory(project_id: str) -> Dict[str, Any]:
    """Generate Ansible dynamic host inventory dictionary for stacks and VMs in a project (UC385)."""
    rows = pg.query_all(
        "SELECT stack, data FROM stack_meta WHERE project_id = %s",
        (project_id,),
    )

    all_hosts: List[str] = []
    hostvars: Dict[str, Dict[str, Any]] = {}
    groups: Dict[str, Dict[str, Any]] = {}

    for r in rows:
        stack = r.get("stack")
        if not stack:
            continue

        meta = r.get("data") or {}
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}

        all_hosts.append(stack)
        ip = meta.get("ip") or meta.get("public_ip") or meta.get("host") or "127.0.0.1"
        provider = (meta.get("provider") or "generic").lower()
        env = (meta.get("env") or meta.get("environment") or "default").lower()

        hostvars[stack] = {
            "ansible_host": ip,
            "provider": provider,
            "environment": env,
            "project_id": project_id,
        }

        # Add to provider group
        groups.setdefault(provider, {"hosts": []})
        groups[provider]["hosts"].append(stack)

        # Add to env group
        groups.setdefault(env, {"hosts": []})
        groups[env]["hosts"].append(stack)

    inventory: Dict[str, Any] = {
        "all": {
            "hosts": all_hosts,
            "vars": {"project_id": project_id},
        },
        "_meta": {
            "hostvars": hostvars,
        },
    }

    for g_name, g_data in groups.items():
        inventory[g_name] = g_data

    return inventory
