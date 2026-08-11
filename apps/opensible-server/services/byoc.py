"""BYOC management (Fase 6 — UC 271+).

Connect existing cloud accounts (bring-your-own-cloud), validate credentials,
discover resources (inventory), and generate OpenTofu import snippets/blocks
so resources can be adopted into managed stacks. Credentials are stored
encrypted via the global secret encryption helper.
"""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

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
        ],
        "regions": ["ap-southeast-1", "ap-southeast-3", "us-east-1", "eu-central-1"],
        "api": "https://sts.amazonaws.com",
    },
    "gcp": {
        "label": "Google Cloud",
        "creds": [{"key": "service_account_json", "label": "Service Account JSON", "secret": True, "multiline": True}],
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


def providers() -> List[Dict[str, Any]]:
    return [{"id": pid, **_PROVIDER_META[pid]} for pid in PROVIDERS]


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "byoc_accounts.json"
    except Exception:
        return Path("data") / "byoc_accounts.json"


def _load() -> List[Dict[str, Any]]:
    try:
        p = _store_path()
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, list):
                return d
    except Exception:
        pass
    return []


def _save(items: List[Dict[str, Any]]) -> None:
    p = _store_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(items, indent=2), encoding="utf-8")


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
        return {"ok": r.status_code in (200, 201), "status": r.status_code, "detail": r.headers.get("X-Subject-Token", "")[:40] if r.status_code in (200, 201) else r.text[:200]}
    if provider == "idcloudhost":
        r = requests.get("https://api.idcloudhost.com/v1/user-resource/vps",
                         headers={"apikey": creds.get("api_token", "")}, timeout=15)
        return {"ok": r.status_code == 200, "status": r.status_code, "detail": r.text[:200]}
    if provider == "aws":
        return {"ok": True, "status": 200, "detail": "local check only — gunakan aws cli (sts get-caller-identity) untuk verifikasi penuh"}
    if provider == "gcp":
        return {"ok": True, "status": 200, "detail": "local check only — gunakan gcloud auth untuk verifikasi penuh"}
    if provider == "azure":
        return {"ok": True, "status": 200, "detail": "local check only — gunakan az cli untuk verifikasi penuh"}
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
    _save(items)
    return {"account_id": account_id, **probe}


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
    items = _load()
    for a in items:
        if a["id"] == account_id:
            a["resource_count"] = len(resources)
            a["last_inventory"] = int(time.time())
    _save(items)
    return {"account_id": account_id, "provider": acct["provider"], "resources": resources,
            "count": len(resources), "meta": meta}


# --------------------------------------------------------------------------
# Import generation
# --------------------------------------------------------------------------

def generate_import(account_id: str, resource_ids: List[str]) -> Dict[str, Any]:
    acct = get_account(account_id)
    if not acct:
        raise ValueError("account not found")
    inv = get_inventory(account_id)
    all_res = {str(r["id"]): r for r in inv["resources"]}
    selected = [all_res[i] for i in resource_ids if i in all_res]
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