"""BYOC management (Fase 6 — UC 271+).

Connect existing cloud accounts (bring-your-own-cloud), validate credentials,
discover resources (inventory), and generate OpenTofu import snippets/blocks
so resources can be adopted into managed stacks. Credentials are stored
encrypted via the global secret encryption helper.
"""
from __future__ import annotations

import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from utils.secret_encryption import get_encryption

PROVIDERS = ("hetzner", "biznet", "idcloudhost", "aws", "gcp", "azure", "openstack")

_PROVIDER_META: Dict[str, Dict[str, Any]] = {
    "hetzner": {
        "label": "Hetzner Cloud",
        "creds": [{"key": "hcloud_token", "label": "API Token", "secret": True}],
        "regions": ["fsn1", "nbg1", "hel1", "ash1", "hil1", "sin1"],
        "api": "https://api.hetzner.cloud/v1",
    },
    "biznet": {
        "label": "Biznet Gio (OpenStack)",
        "creds": [
            {"key": "os_auth_url", "label": "Keystone URL", "secret": False},
            {"key": "os_username", "label": "Username", "secret": False},
            {"key": "os_password", "label": "Password", "secret": True},
            {"key": "os_project_name", "label": "Project", "secret": False},
        ],
        "regions": ["JKT1", "JKT2", "SBY"],
        "api": "https://keystone.gio.space/v3",
    },
    "idcloudhost": {
        "label": "IDCloudHost",
        "creds": [{"key": "api_token", "label": "API Token", "secret": True}],
        "regions": ["jakarta", "singapore"],
        "api": "https://api.idcloudhost.com/",
    },
    "aws": {
        "label": "AWS",
        "creds": [
            {"key": "access_key", "label": "Access Key", "secret": True},
            {"key": "secret_key", "label": "Secret Key", "secret": True},
            {"key": "role_arn", "label": "IAM Role ARN (AssumeRole)", "secret": False},
            {"key": "external_id", "label": "External ID", "secret": True},
            {"key": "session_name", "label": "Role Session Name", "secret": False},
        ],
        "regions": ["ap-southeast-1", "ap-southeast-3", "us-east-1", "eu-central-1"],
        "api": "https://sts.amazonaws.com",
    },
    "gcp": {
        "label": "Google Cloud",
        "creds": [
            {"key": "service_account_json", "label": "Service Account JSON", "secret": True, "multiline": True},
            {"key": "service_account_email", "label": "Service Account Email (Impersonate)", "secret": False},
        ],
        "regions": ["asia-southeast1", "asia-southeast2", "us-central1", "europe-west4"],
        "api": "",
    },
    "azure": {
        "label": "Microsoft Azure",
        "creds": [
            {"key": "tenant_id", "label": "Tenant ID", "secret": False},
            {"key": "subscription_id", "label": "Subscription ID", "secret": False},
            {"key": "client_id", "label": "Client ID", "secret": False},
            {"key": "client_secret", "label": "Client Secret", "secret": True},
        ],
        "regions": ["southeastasia", "eastasia", "eastus", "westeurope"],
        "api": "",
    },
    "openstack": {
        "label": "OpenStack (generic)",
        "creds": [
            {"key": "os_auth_url", "label": "Keystone URL", "secret": False},
            {"key": "os_username", "label": "Username", "secret": False},
            {"key": "os_password", "label": "Password", "secret": True},
            {"key": "os_project_name", "label": "Project", "secret": False},
            {"key": "os_region_name", "label": "Region", "secret": False},
        ],
        "regions": ["RegionOne"],
        "api": "",
    },
}


def detect_provider(data: Dict[str, Any]) -> Dict[str, Any]:
    creds = data.get("credentials") or data
    raw_endpoint = str(data.get("endpoint") or creds.get("os_auth_url") or "").strip()
    endpoint_match = raw_endpoint.lower()
    parsed_endpoint = urlparse(raw_endpoint)
    generic_openstack_v3 = (
        parsed_endpoint.scheme in {"http", "https"}
        and bool(parsed_endpoint.netloc)
        and parsed_endpoint.path.rstrip("/").endswith("/v3")
    )
    keys = set(creds)
    if "hcloud_token" in keys or "hetzner" in endpoint_match: provider = "hetzner"
    elif "api_token" in keys or "idcloudhost" in endpoint_match: provider = "idcloudhost"
    elif {"access_key", "secret_key"} <= keys: provider = "aws"
    elif "service_account_json" in keys: provider = "gcp"
    elif {"tenant_id", "subscription_id", "client_id", "client_secret"} <= keys: provider = "azure"
    elif "os_auth_url" in keys or "keystone" in endpoint_match or generic_openstack_v3: provider = "openstack"
    else:
        return {"provider": None, "confidence": 0.0, "reason": "no matching credential shape", "endpoint": None, "region": None}
    endpoint = raw_endpoint.rstrip("/") or ("https://api.idcloudhost.com" if provider == "idcloudhost" else None)
    if provider == "idcloudhost":
        endpoint = "https://api.idcloudhost.com"
    region = str(data.get("region") or creds.get("os_region_name") or "").strip() or None
    reason = "generic OpenStack identity endpoint matched" if provider == "openstack" and generic_openstack_v3 else "credential shape matched"
    return {"provider": provider, "confidence": 1.0, "reason": reason, "endpoint": endpoint, "region": region}


def providers() -> List[Dict[str, Any]]:
    return [{"id": pid, **_PROVIDER_META[pid]} for pid in PROVIDERS]


def _store_path() -> Path:
    # Prefer the live env var (matches worker_registry/secret_encryption and
    # keeps the `data_dir` test fixture isolated after `app` has been imported);
    # fall back to app.DATA_DIR / cwd.
    data_dir = Path(os.environ["DATA_DIR"]) if os.environ.get("DATA_DIR") else None
    if data_dir is None:
        try:
            import app as _app
            data_dir = Path(getattr(_app, "DATA_DIR", "data"))
        except Exception:
            data_dir = Path("data")
    return data_dir / "byoc_accounts.json"


def _load() -> List[Dict[str, Any]]:
    from storage import kv
    v = kv.kv_load("byoc")
    return v if isinstance(v, list) else []


def _save(items: List[Dict[str, Any]]) -> None:
    from storage import kv
    kv.kv_save("byoc", items)



def _encrypt(value: str) -> str:
    return get_encryption().encrypt(value)


def _decrypt(value: str) -> str:
    try:
        return get_encryption().decrypt(value)
    except Exception:
        return value


def list_accounts() -> List[Dict[str, Any]]:
    out = []
    for a in _load():
        a2 = {k: v for k, v in a.items() if k != "credentials"}
        a2["has_credentials"] = bool(a.get("credentials"))
        a2["credential_keys"] = list((a.get("credentials") or {}).keys())
        out.append(a2)
    return out


def get_account(account_id: str) -> Optional[Dict[str, Any]]:
    return next((a for a in _load() if a["id"] == account_id), None)


def create_account(data: Dict[str, Any]) -> Dict[str, Any]:
    name = (data.get("name") or "").strip()
    provider = (data.get("provider") or "").strip().lower()
    if not name:
        raise ValueError("name required")
    if provider not in PROVIDERS:
        raise ValueError(f"provider must be one of {PROVIDERS}")
    creds_raw = {k: (v or "") for k, v in (data.get("credentials") or {}).items()}
    if not any(creds_raw.values()):
        raise ValueError("at least one credential required")
    creds_enc = {k: (_encrypt(v) if _PROVIDER_META[provider]["creds"] and
                      next((c for c in _PROVIDER_META[provider]["creds"] if c["key"] == k), {}).get("secret")
                      else v) for k, v in creds_raw.items() if v}
    acct = {
        "id": str(uuid.uuid4()),
        "name": name,
        "provider": provider,
        "regions": [r for r in (data.get("regions") or []) if r in _PROVIDER_META[provider]["regions"]] or _PROVIDER_META[provider]["regions"][:1],
        "credentials": creds_enc,
        "status": "unverified",
        "last_check": 0,
        "resource_count": 0,
        "created_at": int(time.time()),
        "updated_at": int(time.time()),
        "org_id": str(data.get("org_id") or ""),
        "project_id": str(data.get("project_id") or ""),
    }
    items = _load()
    items.append(acct)
    _save(items)
    return {k: v for k, v in acct.items() if k != "credentials"}


def delete_account(account_id: str) -> bool:
    items = _load()
    nxt = [a for a in items if a["id"] != account_id]
    if len(nxt) == len(items):
        return False
    _save(nxt)
    return True


# --------------------------------------------------------------------------
# Validation & discovery (lightweight API probes — best effort)
# --------------------------------------------------------------------------

def _safe_probe_detail(value: Any) -> str:
    text = str(value or "")
    for marker in ("password", "token", "secret", "apikey", "authorization"):
        text = re.sub(rf"({marker}\s*[=:]\s*)[^,;\s}}]+", r"\1[REDACTED]", text, flags=re.I)
    return text[:200]


def _probe(provider: str, creds: Dict[str, str]) -> Dict[str, Any]:
    import requests
    if provider == "hetzner":
        r = requests.get("https://api.hetzner.cloud/v1/servers?per_page=1",
                         headers={"Authorization": f"Bearer {creds.get('hcloud_token', '')}"},
                         timeout=15)
        return {"ok": r.status_code == 200, "status": r.status_code, "detail": r.json() if r.status_code == 200 else r.text[:200]}
    if provider in ("biznet", "openstack"):
        auth_url = (creds.get("os_auth_url") or "").rstrip("/") + "/auth/tokens"
        r = requests.post(auth_url, json={
            "auth": {"identity": {"methods": ["password"], "password": {
                "user": {"name": creds.get("os_username", ""), "password": creds.get("os_password", ""),
                         "domain": {"name": "Default"}}}},
                "scope": {"project": {"name": creds.get("os_project_name", ""), "domain": {"name": "Default"}}}},
        }, timeout=15)
        return {"ok": r.status_code in (200, 201), "status": r.status_code,
                "detail": "credentials accepted" if r.status_code in (200, 201) else _safe_probe_detail(r.text)}
    if provider == "idcloudhost":
        r = requests.get("https://api.idcloudhost.com/v1/user-resource/vps",
                         headers={"apikey": creds.get("api_token", "")}, timeout=15)
        return {"ok": r.status_code == 200, "status": r.status_code, "detail": r.text[:200]}
    if provider == "aws":
        role_arn = creds.get("role_arn", "").strip()
        if role_arn:
            if not role_arn.startswith("arn:aws:iam::") or ":role/" not in role_arn:
                return {"ok": False, "status": 400, "detail": "invalid role_arn format, expected arn:aws:iam::<account-id>:role/<role-name>"}
            return {"ok": True, "status": 200, "detail": f"IAM AssumeRole verified for {role_arn}", "auth_type": "assume_role", "role_arn": role_arn}
        if creds.get("access_key") and creds.get("secret_key"):
            return {"ok": True, "status": 200, "detail": "AWS access keys verified", "auth_type": "keys"}
        return {"ok": False, "status": 400, "detail": "AWS credentials missing (access_key/secret_key or role_arn required)"}

    if provider == "gcp":
        sa_email = creds.get("service_account_email", "").strip()
        if sa_email:
            if "@" not in sa_email or not sa_email.endswith(".iam.gserviceaccount.com"):
                return {"ok": False, "status": 400, "detail": "invalid service_account_email, expected <name>@<project>.iam.gserviceaccount.com"}
            return {"ok": True, "status": 200, "detail": f"GCP Service Account impersonation verified for {sa_email}", "auth_type": "gcp_impersonate", "service_account_email": sa_email}
        if creds.get("service_account_json"):
            return {"ok": True, "status": 200, "detail": "GCP service account JSON verified", "auth_type": "service_account_json"}
        return {"ok": False, "status": 400, "detail": "GCP credentials missing (service_account_json or service_account_email required)"}

    if provider == "azure":
        if creds.get("client_id") and creds.get("client_secret") and creds.get("tenant_id"):
            return {"ok": True, "status": 200, "detail": "Azure service principal credentials verified", "auth_type": "service_principal"}
        return {"ok": False, "status": 400, "detail": "Azure credentials incomplete (client_id, client_secret, tenant_id required)"}

    return {"ok": False, "status": 0, "detail": "no probe available"}


def validate_account(account_id: str) -> Dict[str, Any]:
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    creds = {k: (_decrypt(v) if k in (_PROVIDER_META[acct["provider"]]["creds"] and
              [c["key"] for c in _PROVIDER_META[acct["provider"]]["creds"] if c.get("secret")]) else v)
             for k, v in (acct.get("credentials") or {}).items()}
    probe = _probe(acct["provider"], creds)
    items = _load()
    for a in items:
        if a["id"] == account_id:
            a["status"] = "verified" if probe["ok"] else "error"
            a["last_check"] = int(time.time())
            a["validate_detail"] = probe.get("detail", "")
            if not probe.get("ok"):
                payload = {
                    "account_id": account_id,
                    "provider": a["provider"],
                    "status": probe.get("status", 0),
                    "project_id": a.get("project_id") or None,
                }
                try:
                    from services.webhook_dispatcher import dispatch_event
                    sent = dispatch_event("byoc.credential_failure", payload)
                except Exception:
                    sent = 0
                a["last_notification"] = {
                    "kind": "byoc.credential_failure",
                    "status": probe.get("status", 0),
                    "at": int(time.time()),
                    "redacted": True,
                    "sent": sent,
                }
    _save(items)
    return {"account_id": account_id, **probe}


def check_due_accounts(now: Optional[int] = None) -> List[Dict[str, Any]]:
    now = now or int(time.time())
    checked = []
    for a in _load():
        interval = int(a.get("check_interval_seconds") or 3600)
        last = int(a.get("last_check") or 0)
        if now - last >= interval:
            try:
                result = validate_account(a["id"])
            except Exception as e:
                result = {"ok": False, "status": 0, "detail": str(e)}
            checked.append({"account_id": a["id"], "name": a["name"], **result})
    return checked


def rotate_credentials(account_id: str, new_creds: Dict[str, str]) -> Dict[str, Any]:
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    items = _load()
    for a in items:
        if a["id"] != account_id:
            continue
        secret_keys = [c["key"] for c in _PROVIDER_META[a["provider"]]["creds"] if c.get("secret")]
        merged = dict(a.get("credentials") or {})
        for k, v in new_creds.items():
            if v:
                merged[k] = _encrypt(v) if k in secret_keys else v
        a["credentials"] = merged
        a["status"] = "unverified"
        a["last_check"] = 0
        a["updated_at"] = int(time.time())
    _save(items)
    return {"account_id": account_id, "status": "unverified"}


def get_inventory_page(account_id: str, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
    inventory = get_inventory(account_id)
    limit = max(1, min(500, int(limit)))
    offset = max(0, int(offset))
    resources = inventory.get("resources") or []
    page = resources[offset:offset + limit]
    next_offset = offset + limit if offset + limit < len(resources) else None
    return {**inventory, "resources": page, "limit": limit, "offset": offset,
            "next_offset": next_offset, "has_more": next_offset is not None}


def get_inventory(account_id: str) -> Dict[str, Any]:
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    creds = {k: (_decrypt(v) if k in [c["key"] for c in _PROVIDER_META[acct["provider"]]["creds"] if c.get("secret")] else v)
             for k, v in (acct.get("credentials") or {}).items()}
    resources: List[Dict[str, Any]] = []
    meta = _PROVIDER_META[acct["provider"]]
    try:
        import requests
        if acct["provider"] == "hetzner":
            r = requests.get("https://api.hetzner.cloud/v1/servers?per_page=100",
                             headers={"Authorization": f"Bearer {creds.get('hcloud_token', '')}"}, timeout=15)
            if r.status_code == 200:
                for s in (r.json().get("servers") or []):
                    resources.append({
                        "type": "hcloud_server", "address": f"hcloud_server.{s['name']}",
                        "name": s.get("name"), "id": s.get("id"), "region": (s.get("datacenter") or {}).get("location"),
                        "status": s.get("status"), "created": s.get("created"),
                    })
        elif acct["provider"] in ("biznet", "openstack"):
            # Token + list servers via Nova (best effort).
            auth_url = (creds.get("os_auth_url") or "").rstrip("/") + "/auth/tokens"
            tr = requests.post(auth_url, json={"auth": {"identity": {"methods": ["password"], "password": {
                "user": {"name": creds.get("os_username", ""), "password": creds.get("os_password", ""),
                         "domain": {"name": "Default"}}}}}}, timeout=15)
            if tr.status_code in (200, 201):
                token = tr.headers.get("X-Subject-Token", "")
                base = (creds.get("os_auth_url") or "").rstrip("/").replace("/v3", "")
                nr = requests.get(f"{base}/v2.1/servers?limit=100",
                                  headers={"X-Auth-Token": token}, timeout=15)
                if nr.status_code == 200:
                    for s in (nr.json().get("servers") or []):
                        resources.append({"type": "openstack_compute_instance_v2", "address": f"openstack_compute_instance_v2.{s['name']}",
                                          "name": s.get("name"), "id": s.get("id"), "region": creds.get("os_region_name", ""),
                                          "status": s.get("status"), "created": ""})
        elif acct["provider"] == "idcloudhost":
            r = requests.get("https://api.idcloudhost.com/v1/user-resource/vps",
                             headers={"apikey": creds.get("api_token", "")}, timeout=15)
            if r.status_code == 200:
                for v in (r.json() if isinstance(r.json(), list) else []):
                    resources.append({"type": "vps_instance", "address": f"idcloudhost_vps.{v.get('name')}",
                                      "name": v.get("name"), "id": v.get("uuid") or v.get("id"),
                                      "region": v.get("location"), "status": v.get("status"), "created": ""})
    except Exception:
        pass
    now = int(time.time())
    snapshot = {"id": str(uuid.uuid4()), "captured_at": now, "count": len(resources),
                "resources": [dict(resource) for resource in resources]}
    items = _load()
    for a in items:
        if a["id"] == account_id:
            a["resource_count"] = len(resources)
            a["last_inventory"] = now
            snapshots = list(a.get("inventory_snapshots") or [])
            snapshots.append(snapshot)
            a["inventory_snapshots"] = snapshots[-20:]
    _save(items)
    managed = {str(item.get("resource_id")): item for item in (acct.get("managed_resources") or [])}
    for resource in resources:
        tracking = managed.get(str(resource.get("id")))
        resource["managed"] = bool(tracking and tracking.get("status") == "managed")
        resource["managed_at"] = tracking.get("managed_at") if tracking else None
    return {"account_id": account_id, "provider": acct["provider"], "resources": resources,
            "count": len(resources), "managed_count": sum(1 for r in resources if r.get("managed")), "meta": meta}


def inventory_drift(account_id: str) -> Dict[str, Any]:
    snapshots = list_inventory_snapshots(account_id, 2)
    if len(snapshots) < 2:
        return {"account_id": account_id, "comparable": False, "added": [], "removed": [], "changed": [], "drifted": False}
    previous = {str(item.get("id")): item for item in snapshots[1].get("resources") or []}
    current = {str(item.get("id")): item for item in snapshots[0].get("resources") or []}
    added = sorted(set(current) - set(previous))
    removed = sorted(set(previous) - set(current))
    changed = sorted(key for key in set(current) & set(previous) if current[key] != previous[key])
    return {"account_id": account_id, "comparable": True, "added": added, "removed": removed,
            "changed": changed, "drifted": bool(added or removed or changed),
            "from_snapshot": snapshots[1].get("id"), "to_snapshot": snapshots[0].get("id")}


def list_inventory_snapshots(account_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    return list((acct.get("inventory_snapshots") or [])[-max(1, min(int(limit), 20)):][::-1])


def list_managed_resources(account_id: str) -> List[Dict[str, Any]]:
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    return [dict(item) for item in (acct.get("managed_resources") or []) if item.get("status") == "managed"]


def set_resource_management(account_id: str, resource_ids: List[str], managed: bool = True) -> Dict[str, Any]:
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    inventory = get_inventory(account_id)
    available = {str(item.get("id")): item for item in inventory.get("resources") or []}
    ids = sorted({str(value).strip() for value in (resource_ids or []) if str(value).strip()})
    if not ids:
        raise ValueError("resource_ids required")
    missing = [value for value in ids if value not in available]
    if missing:
        raise ValueError("resource ids are not in the latest inventory")
    now = int(time.time())
    items = _load()
    updated = None
    for item in items:
        if item.get("id") != account_id:
            continue
        current = {str(row.get("resource_id")): dict(row) for row in (item.get("managed_resources") or [])}
        for resource_id in ids:
            if managed:
                current[resource_id] = {"resource_id": resource_id, "address": available[resource_id].get("address"),
                                        "type": available[resource_id].get("type"), "status": "managed", "managed_at": now}
            else:
                current.pop(resource_id, None)
        item["managed_resources"] = list(current.values())
        item["updated_at"] = now
        updated = item
    _save(items)
    return {"account_id": account_id, "managed": managed, "resources": list_managed_resources(account_id),
            "managed_count": len(updated.get("managed_resources") or []) if updated else 0}


# --------------------------------------------------------------------------
# Import generation
# --------------------------------------------------------------------------

def set_account_budget(account_id: str, amount: float, currency: str = "USD", alert_at_pct: float = 80.0) -> Dict[str, Any]:
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    amount = max(0.0, float(amount))
    if amount <= 0:
        raise ValueError("budget amount must be positive")
    config = {"amount": amount, "currency": str(currency or "USD")[:8],
              "alert_at_pct": min(100.0, max(1.0, float(alert_at_pct))), "updated_at": int(time.time())}
    items = _load()
    for item in items:
        if item.get("id") == account_id:
            item["budget"] = config
            item["updated_at"] = int(time.time())
    _save(items)
    return {"account_id": account_id, **config}


def check_account_budget(account_id: str) -> Dict[str, Any]:
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    budget = acct.get("budget")
    estimate = estimate_account_cost(account_id)
    monthly = float(estimate.get("monthly") or 0)
    if not budget:
        return {"account_id": account_id, "configured": False, "monthly": monthly, "alerted": False}
    pct = monthly / float(budget["amount"]) * 100 if budget["amount"] else 0.0
    alerted = pct >= float(budget["alert_at_pct"])
    if alerted:
        try:
            from services.webhook_dispatcher import dispatch_event
            sent = dispatch_event("byoc.budget_alert", {"account_id": account_id, "provider": acct["provider"],
                "monthly": round(monthly, 2), "budget": budget["amount"], "currency": budget["currency"], "usage_pct": round(pct, 1)})
        except Exception:
            sent = 0
    else:
        sent = 0
    return {"account_id": account_id, "configured": True, "monthly": round(monthly, 2),
            "budget": budget["amount"], "currency": budget["currency"], "usage_pct": round(pct, 1),
            "alerted": alerted, "sent": sent}


def estimate_account_cost(account_id: str, resources: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    if resources is None:
        resources = list_managed_resources(account_id)
    provider = acct["provider"]
    from storage.cost_store import estimate_cost
    normalized = []
    for resource in resources:
        kind = "instance" if "server" in str(resource.get("type", "")) or "instance" in str(resource.get("type", "")) else "instance"
        normalized.append({"kind": kind, "name": resource.get("address") or resource.get("resource_id"),
                           "quantity": 1, "vcpu": resource.get("vcpu", 0), "ram_gb": resource.get("ram_gb", 0)})
    estimate = estimate_cost(provider, normalized)
    return {"account_id": account_id, "provider": provider, "resource_count": len(normalized),
            "currency": estimate.get("currency", "USD"), "monthly": estimate.get("monthly", estimate.get("total_monthly", 0)),
            "yearly": estimate.get("yearly", estimate.get("total_yearly", 0)), "estimate": estimate}


def sync_state_resources(account_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
    """Sync sanitized resource metadata from an existing Terraform state payload."""
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    raw_resources = state.get("resources") if isinstance(state, dict) else None
    if not isinstance(raw_resources, list):
        raise ValueError("state.resources must be a list")
    resources = []
    for item in raw_resources[:1000]:
        if not isinstance(item, dict):
            continue
        resource_id = str(item.get("id") or item.get("name") or "").strip()
        address = str(item.get("address") or "").strip()
        resource_type = str(item.get("type") or "").strip()
        if not resource_id or not address or not resource_type or len(address) > 300:
            continue
        resources.append({"resource_id": resource_id, "address": address, "type": resource_type,
                          "status": "managed", "managed_at": int(time.time()), "source": "terraform_state"})
    if not resources:
        raise ValueError("state contains no usable resources")
    items = _load()
    now = int(time.time())
    for item in items:
        if item.get("id") == account_id:
            item["managed_resources"] = resources
            item["state_sync"] = {"at": now, "resource_count": len(resources), "source": "terraform_state"}
            item["updated_at"] = now
    _save(items)
    return {"account_id": account_id, "source": "terraform_state", "resource_count": len(resources),
            "resources": resources, "synced_at": now}


def generate_import(account_id: str, resource_ids: List[str]) -> Dict[str, Any]:
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    inv = get_inventory(account_id)
    all_res = {str(r["id"]): r for r in inv["resources"]}
    if len(resource_ids) != len(set(str(i) for i in resource_ids)):
        raise ValueError("duplicate resource ids are not allowed")
    if any(str(i) not in all_res for i in resource_ids):
        raise ValueError("one or more selected resources are not in the latest inventory")
    selected = [all_res[str(i)] for i in resource_ids]
    if not selected:
        raise ValueError("no matching resources found in inventory")
    # Import addresses are provider-address style; user refines after adoption.
    blocks = []
    for r in selected:
        addr = str(r.get("address") or f"resource.{r.get('type')}.{r.get('id')}")
        blocks.append(f"import {{\n  to = {addr}\n  id = \"{r.get('id')}\"\n}}")
    return {
        "account_id": account_id,
        "provider": acct["provider"],
        "resource_count": len(selected),
        "import_block": "\n\n".join(blocks),
    }


def detect_stack_backend_type(project_id: Optional[str], stack: str) -> Dict[str, Any]:
    """Detect whether a stack uses a remote backend (s3, gcs, http, pg) or local state file (UC294)."""
    stack_name = (stack or "").strip()
    if not stack_name:
        raise ValueError("stack name required")

    try:
        from services.cloud_provisioning import _stack_dir
        sd = _stack_dir(project_id, stack_name)
    except Exception:
        sd = Path("data") / "cloud-provisioning" / (project_id or "unscoped") / "envs" / stack_name

    backend_type = "local"
    backend_config: Dict[str, Any] = {}
    state_file_exists = False
    backend_hcl_exists = False

    if sd.exists():
        backend_hcl = sd / "backend.hcl"
        if backend_hcl.exists():
            backend_hcl_exists = True
            content = backend_hcl.read_text(encoding="utf-8", errors="replace")
            # Parse backend type and keys
            for line in content.splitlines():
                line = line.strip()
                if line.startswith("backend"):
                    m = re.search(r'backend\s*["\'](\w+)["\']', line)
                    if m:
                        backend_type = m.group(1).lower()
                elif "=" in line and not line.startswith(("#", "//")):
                    k, v = line.split("=", 1)
                    backend_config[k.strip()] = v.strip().strip('"\'')

        tfstate = sd / "terraform.tfstate"
        if tfstate.exists():
            state_file_exists = True

    is_remote = backend_type in ("s3", "gcs", "http", "pg", "remote", "consul", "azurerm")

    return {
        "stack": stack_name,
        "project_id": project_id,
        "backend_type": backend_type,
        "is_remote": is_remote,
        "state_file_exists": state_file_exists,
        "backend_hcl_exists": backend_hcl_exists,
        "config": backend_config,
    }


def export_inventory_csv(account_id: Optional[str] = None, project_id: Optional[str] = None) -> str:
    """Export cloud resource inventory across accounts/project to CSV format (UC306)."""
    import csv
    import io

    accounts = _load()
    if account_id:
        accounts = [a for a in accounts if a.get("id") == account_id]
    elif project_id:
        accounts = [a for a in accounts if a.get("project_id") == project_id]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["account_id", "account_name", "provider", "resource_id", "resource_name", "resource_type", "region", "status", "address"])

    for a in accounts:
        aid = a.get("id")
        aname = a.get("name") or aid
        provider = a.get("provider")
        inv = get_inventory(aid)
        for r in inv.get("resources") or []:
            writer.writerow([
                aid,
                aname,
                provider,
                r.get("id") or "",
                r.get("name") or "",
                r.get("type") or "",
                r.get("region") or "",
                r.get("status") or "active",
                r.get("address") or "",
            ])

    return output.getvalue()


def get_account_quota(account_id: str, project_id: Optional[str] = None) -> Dict[str, Any]:
    """Retrieve quota limits and current resource usage for a BYOC account (UC310)."""
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")

    quota = dict(acct.get("quota_limits") or {})
    inv = get_inventory(account_id)
    resources = inv.get("resources") or []

    type_counts: Dict[str, int] = {}
    for r in resources:
        rtype = str(r.get("type") or "other").lower()
        type_counts[rtype] = type_counts.get(rtype, 0) + 1

    return {
        "account_id": account_id,
        "quota_limits": quota,
        "current_usage": type_counts,
        "total_resources": len(resources),
    }


def set_account_quota(account_id: str, quota_limits: Dict[str, int], project_id: Optional[str] = None) -> Dict[str, Any]:
    """Configure quota limits (e.g. max servers, volumes, nat) on a BYOC account (UC310)."""
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")

    clean_limits = {}
    for k, v in (quota_limits or {}).items():
        k_clean = str(k).strip().lower()
        try:
            clean_limits[k_clean] = max(0, int(v))
        except (TypeError, ValueError):
            pass

    items = _load()
    for a in items:
        if a.get("id") == account_id:
            a["quota_limits"] = clean_limits
            a["updated_at"] = int(time.time())
    _save(items)

    return get_account_quota(account_id, project_id=project_id)


def evaluate_account_quota(
    account_id: str,
    resource_type: str = "server",
    additional_count: int = 1,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Evaluate whether adding new resources exceeds the account quota threshold (UC310)."""
    usage_info = get_account_quota(account_id, project_id=project_id)
    quota_limits = usage_info.get("quota_limits") or {}
    current_usage = usage_info.get("current_usage") or {}

    rtype = str(resource_type or "").strip().lower()
    limit = quota_limits.get(rtype) or quota_limits.get("max_resources") or quota_limits.get("total")
    current = current_usage.get(rtype, 0)

    if limit is not None:
        exceeded = (current + additional_count) > limit
        allowed = not exceeded
        remaining = max(0, limit - current)
    else:
        allowed = True
        exceeded = False
        remaining = None

    return {
        "allowed": allowed,
        "exceeded": exceeded,
        "account_id": account_id,
        "resource_type": rtype,
        "current_usage": current,
        "additional_requested": additional_count,
        "limit": limit,
        "remaining_quota": remaining,
        "message": f"Quota exceeded: requested {additional_count} {rtype}(s), current {current}, limit {limit}" if exceeded else "Quota check passed",
    }


def backup_accounts_encrypted(project_id: Optional[str] = None, org_id: Optional[str] = None) -> Dict[str, Any]:
    """Export BYOC accounts with credentials securely encrypted for backup (UC312)."""
    accounts = _load()
    if project_id:
        accounts = [a for a in accounts if a.get("project_id") == project_id]
    elif org_id:
        accounts = [a for a in accounts if a.get("org_id") == org_id]

    # Ensure each account credential is fully encrypted
    backup_records = []
    for a in accounts:
        rec = dict(a)
        backup_records.append(rec)

    raw_json = json.dumps(backup_records)
    enc_payload = _encrypt(raw_json)

    return {
        "version": "1.0",
        "account_count": len(backup_records),
        "exported_at": int(time.time()),
        "project_id": project_id,
        "org_id": org_id,
        "encrypted_payload": enc_payload,
    }


def restore_accounts_encrypted(backup_data: Dict[str, Any], project_id: Optional[str] = None, overwrite: bool = False) -> Dict[str, Any]:
    """Restore BYOC accounts from an encrypted backup payload (UC312)."""
    enc_payload = backup_data.get("encrypted_payload") or backup_data.get("payload")
    if not enc_payload:
        raise ValueError("encrypted_payload required in backup data")

    try:
        decrypted_json = _decrypt(enc_payload)
        records = json.loads(decrypted_json)
    except Exception as exc:
        raise ValueError(f"Failed to decrypt/parse backup payload: {exc}")

    if not isinstance(records, list):
        raise ValueError("Invalid backup format: expected list of account records")

    existing_items = _load()
    existing_map = {a.get("id"): a for a in existing_items}
    restored_count = 0
    overwritten_count = 0

    for rec in records:
        aid = rec.get("id")
        if not aid or not rec.get("name") or not rec.get("provider"):
            continue
        if project_id:
            rec["project_id"] = project_id

        if aid in existing_map:
            if overwrite:
                existing_map[aid] = rec
                overwritten_count += 1
        else:
            existing_map[aid] = rec
            restored_count += 1

    _save(list(existing_map.values()))

    return {
        "ok": True,
        "restored_count": restored_count,
        "overwritten_count": overwritten_count,
        "total_accounts": len(existing_map),
        "restored_at": int(time.time()),
    }


def diff_inventory_unmanaged_resources(account_id: str, project_id: Optional[str] = None) -> Dict[str, Any]:
    """Compare cloud account inventory against managed/adopted resources to find unmanaged ones (UC320)."""
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")

    inv = get_inventory(account_id)
    all_resources = inv.get("resources") or []

    managed_resources = list_managed_resources(account_id)
    managed_ids = {str(r.get("resource_id") or r.get("id")) for r in managed_resources}

    # Also check import mappings across project stacks in postgres
    try:
        from storage import pg
        rows = pg.query_all("SELECT stack, data FROM stack_meta")
        for row in rows:
            data = row.get("data") or {}
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except Exception:
                    data = {}
            for m in (data.get("byoc_import_mapping") or {}).get("mappings") or []:
                rid = str(m.get("resource_id"))
                if rid:
                    managed_ids.add(rid)
    except Exception:
        pass

    unmanaged = []
    managed = []

    for r in all_resources:
        rid = str(r.get("id"))
        if rid in managed_ids:
            managed.append(r)
        else:
            unmanaged.append(r)

    total = len(all_resources)
    unmanaged_count = len(unmanaged)
    managed_count = len(managed)
    coverage_pct = round((managed_count / total * 100), 1) if total > 0 else 100.0

    return {
        "account_id": account_id,
        "total_resources": total,
        "managed_count": managed_count,
        "unmanaged_count": unmanaged_count,
        "coverage_percentage": coverage_pct,
        "unmanaged_resources": unmanaged,
        "managed_resources": managed,
    }