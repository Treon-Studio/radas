"""IDCloudHost provider adapter — schema, tfvars order, secret keys, inventory.

IDCloudHost is an Indonesian VPS provider with datacenters in Jakarta and
Singapore. It does not ship an official Terraform provider, so the OpenTofu
blueprint provisions via an HTTP/REST template; this adapter defines the
wizard schema, secret handling and inventory synthesis for the UI flow.
"""
from __future__ import annotations

from typing import Any, Dict, List

from .base import ProviderAdapter


SCHEMA: Dict[str, Any] = {
    "provider": "idcloudhost",
    "groups": [
        {
            "id": "project",
            "title": "Project",
            "icon": "fa-folder",
            "fields": [
                {"name": "env", "label": "Environment", "type": "string", "default": "dev", "required": True,
                 "help": "Short env tag — dev / sit / prod."},
                {"name": "project_name", "label": "Project name (naming prefix)", "type": "string", "required": True,
                 "help": "Used as the prefix for every hostname: <project_name>-<env>-<role>."},
                {"name": "region", "label": "Region / location", "type": "select", "default": "jakarta",
                 "options": ["jakarta", "singapore"],
                 "help": "IDCloudHost datacenter — Jakarta or Singapore."},
            ],
        },
        {
            "id": "credentials",
            "title": "Credentials",
            "icon": "fa-key",
            "secret": True,
            "fields": [
                {"name": "api_token", "label": "IDCloudHost API token", "type": "secret", "required": True,
                 "help": "Create the token in the IDCloudHost dashboard (Account → API). Stored encrypted per stack."},
            ],
        },
        {
            "id": "compute",
            "title": "Compute",
            "icon": "fa-server",
            "fields": [
                {"name": "server_plan", "label": "Server plan", "type": "select", "default": "vision-s-2",
                 "options": ["vision-s-1", "vision-s-2", "vision-s-3", "vision-s-4", "vision-s-5", "vision-s-6"],
                 "help": "IDCloudHost vision plan size (CPU / RAM)."},
                {"name": "os_image", "label": "OS image", "type": "string", "default": "ubuntu-24.04",
                 "help": "OS template name (ubuntu-24.04, debian-12, ...)."},
                {"name": "ssh_public_key", "label": "SSH public key", "type": "string", "default": "",
                 "help": "ssh-ed25519 or ssh-rsa public key injected into the server."},
                {"name": "app_vm_count", "label": "App VM count", "type": "number", "default": 1, "min": 0, "max": 50,
                 "help": "Number of app VPS instances to provision."},
            ],
        },
        {
            "id": "extras",
            "title": "Extra VMs (optional)",
            "icon": "fa-plus-square",
            "fields": [
                {"name": "extra_vms", "label": "Ad-hoc VMs (bastion / load-test / etc.)", "type": "extra_vms",
                 "default": {}},
            ],
        },
    ],
}


TFVARS_ORDER = [
    "env", "project_name", "region",
    "server_plan", "os_image", "ssh_public_key", "app_vm_count",
    "api_token",
    "extra_vms", "labels",
]

SECRET_KEYS = ("api_token",)

PLATFORM_OVERRIDE_KEYS = {"server_plan", "os_image", "region"}


def _iter_state_resources(state: Dict[str, Any]):
    for r in state.get("resources", []) or []:
        for inst in r.get("instances", []) or []:
            yield {
                "type": r.get("type"),
                "name": r.get("name"),
                "values": inst.get("attributes") or {},
                "address": (f"{r.get('module','')}." if r.get("module") else "") + f"{r.get('type')}.{r.get('name')}",
            }


def build_inventory(state: Dict[str, Any]) -> Dict[str, Any]:
    """Synthesize the VPS inventory from the REST-template state."""
    instances: List[Dict[str, Any]] = []
    for r in _iter_state_resources(state):
        if r.get("type") != "terraform_data" or r.get("name") != "virtual_server":
            continue
        v = r.get("values") or {}
        spec = v.get("input") or {}
        if not isinstance(spec, dict):
            continue
        labels = spec.get("metadata") or {}
        instances.append({
            "address": r.get("address"),
            "hostname": spec.get("hostname") or v.get("id"),
            "instance_id": str(v.get("id")) if v.get("id") is not None else None,
            "status": v.get("result") and "applied" or "provisioning",
            "az": spec.get("region"),
            "image_id": spec.get("os"),
            "flavor_id": spec.get("plan"),
            "private_ip": None,
            "mac": None,
            "port_id": None,
            "public_ip": None,
            "subnet_id": None,
            "subnet_name": None,
            "subnet_cidr": None,
            "subnet_gateway": None,
            "vpc_id": None,
            "vpc_name": None,
            "vpc_cidr": None,
            "security_groups": [],
            "system_disk_type": None,
            "system_disk_size": None,
            "role": labels.get("role") if isinstance(labels, dict) else spec.get("role"),
        })

    instances.sort(key=lambda x: (x.get("hostname") or ""))
    return {
        "vms": instances,
        "vpcs": [],
        "subnets": [],
        "eips": [{"id": x["instance_id"], "address": x["public_ip"]} for x in instances if x.get("public_ip")],
        "load_balancers": [],
        "count": len(instances),
    }


ADAPTER = ProviderAdapter(
    id="idcloudhost",
    label="IDCloudHost",
    description="IDCloudHost — Indonesian VPS provider (Jakarta & Singapore regions).",
    logo="idcloudhost",
    schema=SCHEMA,
    tfvars_order=TFVARS_ORDER,
    secret_keys=SECRET_KEYS,
    platform_override_keys=PLATFORM_OVERRIDE_KEYS,
    build_inventory=build_inventory,
    enabled=True,
)