"""Biznet Gio Cloud provider adapter — schema, tfvars order, secret keys, inventory.

Biznet Gio Cloud is an Indonesian public cloud built on OpenStack. This
adapter models the OpenStack-compatible resources (VPC network/subnet/router,
security groups, compute instances, floating IPs and Octavia load balancer).
"""
from __future__ import annotations

from typing import Any, Dict, List

from .base import ProviderAdapter


SCHEMA: Dict[str, Any] = {
    "provider": "biznet",
    "groups": [
        {
            "id": "project",
            "title": "Project",
            "icon": "fa-folder",
            "fields": [
                {"name": "env", "label": "Environment", "type": "string", "default": "dev", "required": True,
                 "help": "Short env tag — dev / sit / prod."},
                {"name": "project_name", "label": "Project name (naming prefix)", "type": "string", "required": True,
                 "help": "Used as the prefix for every resource: <project_name>-<env>-<role>."},
                {"name": "region", "label": "Region / location", "type": "select", "default": "JKT2",
                 "options": ["JKT1", "JKT2", "SBY", "SIN"],
                 "help": "Gio region — Jakarta (JKT1/JKT2), Surabaya (SBY), Singapore (SIN)."},
            ],
        },
        {
            "id": "credentials",
            "title": "Credentials",
            "icon": "fa-key",
            "secret": True,
            "fields": [
                {"name": "os_auth_url", "label": "Keystone auth URL", "type": "string",
                 "default": "https://keystone.gio.space/v3", "required": True,
                 "help": "Gio identity endpoint (Keystone v3), e.g. https://keystone.gio.space/v3."},
                {"name": "os_username", "label": "Username", "type": "string", "required": True,
                 "help": "Gio cloud account username."},
                {"name": "os_password", "label": "Password", "type": "secret", "required": True,
                 "help": "Gio cloud account password. Stored encrypted per stack."},
                {"name": "os_project_name", "label": "Project / tenant name", "type": "string", "required": True,
                 "help": "The Gio project (tenant) that owns the resources."},
                {"name": "os_domain_name", "label": "Domain name", "type": "string", "default": "Default",
                 "help": "Identity domain — usually 'Default'."},
            ],
        },
        {
            "id": "network",
            "title": "Networking",
            "icon": "fa-network-wired",
            "fields": [
                {"name": "network_cidr", "label": "Network CIDR", "type": "cidr", "default": "10.0.0.0/16", "required": True,
                 "help": "Private network range for the Gio project network."},
                {"name": "app_subnet_cidr", "label": "App subnet CIDR", "type": "cidr", "default": "10.0.1.0/24", "required": True,
                 "help": "Subnet inside the network CIDR where app + platform VMs attach."},
            ],
        },
        {
            "id": "compute",
            "title": "Compute defaults",
            "icon": "fa-server",
            "fields": [
                {"name": "image", "label": "Default image", "type": "string", "default": "ubuntu-24.04",
                 "help": "OpenStack image name (ubuntu-24.04, debian-12, ...)."},
                {"name": "flavor", "label": "Default flavor", "type": "string", "default": "g2.small",
                 "help": "Gio flavor name (g1.small, g2.small, g2.medium, ...)."},
                {"name": "app_vm_count", "label": "App VM count", "type": "number", "default": 0, "min": 0, "max": 50,
                 "help": "Number of generic app VMs to create. Leave 0 if you only want the Platform pool."},
            ],
        },
        {
            "id": "platform",
            "title": "Platform pool",
            "icon": "fa-layer-group",
            "fields": [
                {"name": "enable_platform", "label": "Provision platform pool", "type": "bool", "default": False},
                {"name": "platform_roles", "label": "Platform roles (rename / add / remove, set count + flavor per role)", "type": "role_counts",
                 "default": {"postgres": 1, "redis": 1, "observability": 1},
                 "roles": ["postgres", "redis", "observability", "nexus", "openbao", "runner"],
                 "flavor_field": "platform_overrides",
                 "flavor_key": "flavor",
                 "help": "Edit role names inline, set VM count, and optionally override the flavor per role."},
                {"name": "platform_overrides", "label": "Platform per-role overrides (auto)", "type": "hidden_map",
                 "default": {}},
            ],
        },
        {
            "id": "edge",
            "title": "Load balancer",
            "icon": "fa-globe",
            "fields": [
                {"name": "enable_load_balancer", "label": "Provision Octavia load balancer", "type": "bool", "default": False,
                 "help": "Creates an Octavia LBaaSv2 load balancer with a floating IP in front of the app pool."},
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
    "network_cidr", "app_subnet_cidr",
    "image", "flavor", "app_vm_count",
    "os_auth_url", "os_username", "os_password", "os_project_name", "os_domain_name",
    "enable_platform", "platform_roles", "platform_overrides",
    "enable_load_balancer",
    "extra_vms", "labels",
]

SECRET_KEYS = ("os_password",)

PLATFORM_OVERRIDE_KEYS = {"flavor", "image", "region"}


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
    networks: Dict[str, Dict[str, Any]] = {}
    subnets_by_net: Dict[str, List[Dict[str, Any]]] = {}
    security_groups: Dict[str, str] = {}
    load_balancers: List[Dict[str, Any]] = []
    floating_ips: List[Dict[str, Any]] = []

    resources = list(_iter_state_resources(state))

    for r in resources:
        t = r.get("type") or ""
        v = r.get("values") or {}
        rid = str(v.get("id")) if v.get("id") is not None else ""
        if t == "openstack_networking_network_v2" and rid:
            networks[rid] = {"name": v.get("name"), "cidr": None}
        elif t == "openstack_networking_subnet_v2":
            nid = str(v.get("network_id") or "")
            if nid:
                subnets_by_net.setdefault(nid, []).append({
                    "id": rid or f"{nid}-{v.get('cidr')}",
                    "name": v.get("name") or "subnet",
                    "cidr": v.get("cidr"),
                    "gateway_ip": v.get("gateway_ip"),
                    "vpc_id": nid,
                })
        elif t == "openstack_networking_secgroup_v2" and rid:
            security_groups[rid] = v.get("name") or rid
        elif t == "openstack_lb_loadbalancer_v2" and rid:
            load_balancers.append({
                "id": rid,
                "name": v.get("name"),
                "type": v.get("description"),
                "location": v.get("availability_zone"),
                "ipv4": None,
                "ipv6": None,
            })
        elif t == "openstack_networking_floatingip_v2" and rid:
            floating_ips.append({"id": rid, "address": v.get("address"), "instance_id": v.get("port_id")})

    instances: List[Dict[str, Any]] = []
    for r in resources:
        if r.get("type") != "openstack_compute_instance_v2":
            continue
        v = r.get("values") or {}
        nid = str(v.get("network")[0].get("uuid") or "") if isinstance(v.get("network"), list) and v.get("network") else ""
        net = networks.get(nid, {})
        labels = v.get("metadata") or {}
        private_ip = None
        if isinstance(v.get("network"), list) and v.get("network"):
            private_ip = v["network"][0].get("fixed_ip") or None
        instances.append({
            "address": r.get("address"),
            "hostname": v.get("name"),
            "instance_id": str(v.get("id")) if v.get("id") is not None else None,
            "status": v.get("status"),
            "az": v.get("availability_zone"),
            "image_id": v.get("image_id"),
            "flavor_id": v.get("flavor_id"),
            "private_ip": private_ip,
            "mac": None,
            "port_id": None,
            "public_ip": v.get("access_ip_v4") or None,
            "subnet_id": None,
            "subnet_name": None,
            "subnet_cidr": None,
            "subnet_gateway": None,
            "vpc_id": nid or None,
            "vpc_name": net.get("name"),
            "vpc_cidr": net.get("cidr"),
            "security_groups": [security_groups.get(x, x) for x in (v.get("security_groups") or [])],
            "system_disk_type": None,
            "system_disk_size": None,
            "role": labels.get("role") if isinstance(labels, dict) else None,
        })

    instances.sort(key=lambda x: (x.get("hostname") or ""))
    all_subnets: List[Dict[str, Any]] = []
    for sl in subnets_by_net.values():
        all_subnets.extend(sl)
    return {
        "vms": instances,
        "vpcs": [{"id": k, **val} for k, val in networks.items()],
        "subnets": all_subnets,
        "eips": floating_ips,
        "load_balancers": load_balancers,
        "count": len(instances),
    }


ADAPTER = ProviderAdapter(
    id="biznet",
    label="Biznet Gio",
    description="Biznet Gio Cloud — Indonesian OpenStack-based public cloud (VPC, VMs, load balancer).",
    logo="biznet",
    schema=SCHEMA,
    tfvars_order=TFVARS_ORDER,
    secret_keys=SECRET_KEYS,
    platform_override_keys=PLATFORM_OVERRIDE_KEYS,
    build_inventory=build_inventory,
    enabled=True,
)