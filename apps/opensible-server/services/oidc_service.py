"""OIDC SSO (Fase 5 — UC 98). Config + discovery + auth URL + code exchange."""
from __future__ import annotations

import json
import time
import urllib.parse
from pathlib import Path
from typing import Any, Dict, Optional


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "oidc_config.json"
    except Exception:
        return Path("data") / "oidc_config.json"


def get_config() -> Dict[str, Any]:
    try:
        p = _store_path()
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, dict):
                return d
    except Exception:
        pass
    return {}


def is_configured() -> bool:
    c = get_config()
    return bool(c.get("issuer") and c.get("client_id"))


def save_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    clean = {k: cfg.get(k) for k in ("issuer", "client_id", "client_secret", "scopes", "redirect_uri") if cfg.get(k)}
    clean["scopes"] = clean.get("scopes") or "openid profile email"
    clean["redirect_uri"] = clean.get("redirect_uri") or "http://localhost:8080/api/auth/sso/callback"
    p = _store_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(clean, indent=2), encoding="utf-8")
    return clean


def discovery(issuer: str) -> Dict[str, Any]:
    import requests
    r = requests.get(issuer.rstrip("/") + "/.well-known/openid-configuration", timeout=15)
    r.raise_for_status()
    return r.json()


def authorization_url(cfg: Dict[str, Any], discovery_meta: Dict[str, Any]) -> str:
    params = {
        "response_type": "code",
        "client_id": cfg["client_id"],
        "redirect_uri": cfg["redirect_uri"],
        "scope": cfg.get("scopes", "openid profile email"),
        "state": "radas-sso",
    }
    return discovery_meta.get("authorization_endpoint") + "?" + urllib.parse.urlencode(params)


def exchange_code(cfg: Dict[str, Any], discovery_meta: Dict[str, Any], code: str) -> Dict[str, Any]:
    import requests
    r = requests.post(discovery_meta.get("token_endpoint"), data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": cfg["redirect_uri"],
        "client_id": cfg["client_id"],
        "client_secret": cfg.get("client_secret", ""),
    }, timeout=15)
    r.raise_for_status()
    return r.json()
