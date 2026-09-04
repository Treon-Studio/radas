"""OAuth provider adapter framework for the RADAS 9Router module.

Authorization-code + PKCE (S256) flows against the same provider endpoints the
upstream 9Router registry uses (claude, codex, github as the first adapters).
Flow state lives in the RADAS kv store with a short TTL and is single-use;
tokens are encrypted with the RADAS SecretEncryption envelope before they
touch PostgreSQL and are never returned by any API.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Optional

from storage import pg
from storage.kv import kv_get, kv_set
from utils.secret_encryption import get_encryption

logger = logging.getLogger(__name__)

FLOW_TTL_SECONDS = 600
REFRESH_LEAD_SECONDS = 60


class OAuthError(RuntimeError):
    """Management-plane OAuth failure; never carries token material."""

    def __init__(self, message: str, *, status: int = 400):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class OAuthProviderSpec:
    name: str
    authorize_url: str
    token_url: str
    scopes: str
    client_id_env: str
    refresh_encoding: str = "form"  # claude refreshes use JSON bodies
    refresh_lead_seconds: int = REFRESH_LEAD_SECONDS
    default_client_id: str = ""  # public upstream identifiers, env overrides


OAUTH_PROVIDERS: Dict[str, OAuthProviderSpec] = {
    "claude": OAuthProviderSpec(
        "claude",
        "https://claude.ai/oauth/authorize",
        "https://api.anthropic.com/v1/oauth/token",
        "org:create_api_key user:profile user:inference",
        "RADAS_OAUTH_CLAUDE_CLIENT_ID",
        refresh_encoding="json",
        refresh_lead_seconds=14400,
    ),
    "codex": OAuthProviderSpec(
        "codex",
        "https://auth.openai.com/oauth/authorize",
        "https://auth.openai.com/oauth/token",
        "openid profile email offline_access",
        "RADAS_OAUTH_CODEX_CLIENT_ID",
        default_client_id="app_EMoamEEZ73f0CkXaXp7hrann",
    ),
    "gemini-cli": OAuthProviderSpec(
        "gemini-cli",
        "https://accounts.google.com/o/oauth2/v2/auth",
        "https://oauth2.googleapis.com/token",
        "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
        "RADAS_OAUTH_GEMINI_CLI_CLIENT_ID",
    ),
    "antigravity": OAuthProviderSpec(
        "antigravity",
        "https://accounts.google.com/o/oauth2/v2/auth",
        "https://oauth2.googleapis.com/token",
        "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/cclog https://www.googleapis.com/auth/experimentsandconfigs",
        "RADAS_OAUTH_ANTIGRAVITY_CLIENT_ID",
    ),
    "clinepass": OAuthProviderSpec(
        "clinepass",
        "https://api.cline.bot/api/v1/auth/authorize",
        "https://api.cline.bot/api/v1/auth/token",
        "",
        "RADAS_OAUTH_CLINEPASS_CLIENT_ID",
    ),
    "iflow": OAuthProviderSpec(
        "iflow",
        "https://iflow.cn/oauth",
        "https://iflow.cn/oauth/token",
        "",
        "RADAS_OAUTH_IFLOW_CLIENT_ID",
        default_client_id="10009311001",
    ),
    "github": OAuthProviderSpec(
        "github",
        "https://github.com/login/oauth/authorize",
        "https://github.com/login/oauth/access_token",
        "read:user",
        "RADAS_OAUTH_GITHUB_CLIENT_ID",
        default_client_id="Iv1.b507a08c87ecfe98",
    ),
}

#: Device-code flow providers (RFC 8628) with complete upstream endpoint data.
#: token_url mirrors the upstream registry; device polling uses the standard
#: urn:ietf:params:oauth:grant-type:device_code grant.
OAUTH_DEVICE_PROVIDERS: Dict[str, Dict[str, str]] = {
    "kimi": {
        "device_code_url": "https://auth.kimi.com/api/oauth/device_authorization",
        "token_url": "https://auth.kimi.com/api/oauth/token",
        "client_id_env": "RADAS_OAUTH_KIMI_CLIENT_ID",
        "default_client_id": "17e5f671-d194-4dfb-9706-5516cb48c098",
        "scope": "",
    },
    "grok-cli": {
        "device_code_url": "https://auth.x.ai/oauth2/device/code",
        "token_url": "https://auth.x.ai/oauth2/token",
        "client_id_env": "RADAS_OAUTH_GROK_CLI_CLIENT_ID",
        "default_client_id": "b1a00492-073a-47ea-816f-4c329264a828",
        "scope": "openid profile email offline_access",
    },
    "github-device": {
        "device_code_url": "https://github.com/login/device/code",
        "token_url": "https://github.com/login/oauth/access_token",
        "client_id_env": "RADAS_OAUTH_GITHUB_CLIENT_ID",
        "default_client_id": "Iv1.b507a08c87ecfe98",
        "scope": "read:user",
    },
}

#: Providers whose upstream flow is an operator-side token import (extracted
#: from the operator's local CLI session) or a custom exchange that needs
#: machine-local context. The server-side equivalent is an explicit,
#: encrypted token import. Scope strings are optional.
OAUTH_IMPORT_PROVIDERS: Dict[str, str] = {
    "cursor": "import_token",
    "kimchi": "browser_token",
    "kiro": "aws_oidc_device",
    "trae": "marscode_exchange",
    "codebuddy-cn": "state_poll",
    "codebuddy-intl": "state_poll",
    "cline": "cli_session",
}

ALL_OAUTH_PROVIDER_NAMES = sorted(
    set(OAUTH_PROVIDERS) | set(OAUTH_DEVICE_PROVIDERS) | set(OAUTH_IMPORT_PROVIDERS)
)

_opener: Any = urllib.request.urlopen


#: Maps the gateway provider name (api.ai_router_routes domain) to the OAuth
#: provider name used for account storage.
GATEWAY_TO_OAUTH = {"anthropic": "claude", "openai": "codex", "github": "github", "google": "gemini-cli"}


def oauth_provider_name(gateway_provider: str) -> Optional[str]:
    """OAuth provider name backing a gateway provider, if any."""
    name = GATEWAY_TO_OAUTH.get(gateway_provider, gateway_provider)
    return name if name in ALL_OAUTH_PROVIDER_NAMES else None


def client_id_for(spec: OAuthProviderSpec) -> str:
    """Public accessor used by the metadata endpoint."""
    return _client_id(spec)


def _client_id(spec: OAuthProviderSpec) -> str:
    import os

    return os.environ.get(spec.client_id_env, "").strip() or spec.default_client_id


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)  # 43+ chars, URL-safe
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("utf-8")).digest()).decode("utf-8").rstrip("=")
    return verifier, challenge


def begin_flow(org_id: str, provider: str, label: str, redirect_uri: str) -> dict[str, Any]:
    spec = OAUTH_PROVIDERS.get(provider)
    if not spec:
        raise OAuthError(f"Unknown OAuth provider {provider}")
    client_id = _client_id(spec)
    if not client_id:
        raise OAuthError(f"OAuth client for {provider} is not configured ({spec.client_id_env})", status=503)
    if not redirect_uri.startswith(("http://127.0.0.1:", "http://localhost:", "https://")):
        raise OAuthError("redirect_uri must be https or a loopback http URL")

    state = secrets.token_urlsafe(24)
    verifier, challenge = _pkce_pair()
    kv_set(
        "ai_oauth_flow",
        state,
        {
            "org_id": org_id,
            "provider": provider,
            "label": (label or "").strip()[:120],
            "redirect_uri": redirect_uri,
            "code_verifier": verifier,
            "created_at": time.time(),
        },
    )
    params = urllib.parse.urlencode({
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": spec.scopes,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
    })
    return {"authorize_url": f"{spec.authorize_url}?{params}", "state": state}


def _load_flow(org_id: str, state: str, *, consume: bool) -> Dict[str, Any]:
    flow = kv_get("ai_oauth_flow", state)
    if not isinstance(flow, dict) or not flow.get("code_verifier"):
        raise OAuthError("Unknown or expired OAuth state", status=400)
    if flow.get("org_id") != org_id:
        raise OAuthError("OAuth state belongs to a different organization", status=403)
    if time.time() - float(flow.get("created_at") or 0) > FLOW_TTL_SECONDS:
        raise OAuthError("OAuth flow expired; restart the connection", status=400)
    if consume:
        from storage.kv import kv_delete

        try:
            kv_delete("ai_oauth_flow", state)
        except Exception:
            # Single-use is best-effort here; the token exchange already validated org binding.
            logger.debug("OAuth flow cleanup failed for state", exc_info=True)
    return flow


def _token_request(spec: OAuthProviderSpec, payload: dict[str, Any]) -> dict[str, Any]:
    body = (
        json.dumps(payload).encode("utf-8")
        if spec.refresh_encoding == "json" and payload.get("grant_type") == "refresh_token"
        else urllib.parse.urlencode(payload).encode("utf-8")
    )
    req = urllib.request.Request(
        spec.token_url,
        data=body,
        method="POST",
        headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with _opener(req, timeout=30) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read(512).decode("utf-8", errors="replace")
        raise OAuthError(f"Token endpoint returned HTTP {exc.code}", status=502) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise OAuthError("Token endpoint unreachable", status=502) from exc
    try:
        result = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise OAuthError("Token endpoint returned an invalid payload", status=502) from exc
    if not isinstance(result, dict) or result.get("error") or not result.get("access_token"):
        raise OAuthError("Token endpoint rejected the exchange", status=502)
    return result


def complete_flow(org_id: str, provider: str, code: str, state: str) -> dict[str, Any]:
    spec = OAUTH_PROVIDERS.get(provider)
    if not spec:
        raise OAuthError(f"Unknown OAuth provider {provider}")
    if not code or not state:
        raise OAuthError("code and state are required")
    flow = _load_flow(org_id, state, consume=True)
    client_id = _client_id(spec)
    if not client_id:
        raise OAuthError(f"OAuth client for {provider} is not configured ({spec.client_id_env})", status=503)

    tokens = _token_request(spec, {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "code": code,
        "redirect_uri": flow["redirect_uri"],
        "code_verifier": flow["code_verifier"],
    })
    return _store_tokens(org_id, provider, flow["label"], client_id, spec, tokens)


def refresh_account(org_id: str, provider: str, label: str, *, force: bool = False) -> str:
    """Refresh one stored account and return the decrypted access token."""
    spec = OAUTH_PROVIDERS.get(provider)
    if not spec:
        raise OAuthError(f"Unknown OAuth provider {provider}")
    row = pg.query_one(
        "SELECT * FROM org_ai_oauth_accounts WHERE org_id = %s AND provider_name = %s AND label = %s",
        (org_id, provider, label),
    )
    if not row or not row.get("refresh_token_encrypted"):
        raise OAuthError("No refreshable OAuth account for this provider", status=404)
    expires_at = float(row.get("expires_at") or 0)
    if not force and time.time() < expires_at - spec.refresh_lead_seconds:
        return get_encryption().decrypt(row["access_token_encrypted"])

    tokens = _token_request(spec, {
        "grant_type": "refresh_token",
        "client_id": _client_id(spec),
        "refresh_token": get_encryption().decrypt(row["refresh_token_encrypted"]),
    })
    _store_tokens(org_id, provider, label, row.get("client_id") or "", spec, tokens)
    return str(tokens["access_token"])


def get_valid_access_token(org_id: str, provider: str) -> Optional[str]:
    """Newest connected account's access token, refreshing when due."""
    row = pg.query_one(
        "SELECT label, expires_at, access_token_encrypted, refresh_token_encrypted FROM org_ai_oauth_accounts "
        "WHERE org_id = %s AND provider_name = %s AND status = 'connected' "
        "ORDER BY updated_at DESC LIMIT 1",
        (org_id, provider),
    )
    if not row:
        return None
    spec = OAUTH_PROVIDERS.get(provider)
    expires_at = float(row.get("expires_at") or 0)
    if spec and row.get("refresh_token_encrypted") and time.time() >= expires_at - spec.refresh_lead_seconds:
        try:
            return refresh_account(org_id, provider, row["label"])
        except OAuthError:
            logger.warning("OAuth refresh failed for %s/%s", org_id, provider, exc_info=True)
            pg.execute(
                "UPDATE org_ai_oauth_accounts SET status = 'error', updated_at = %s WHERE org_id = %s AND provider_name = %s AND label = %s",
                (time.time(), org_id, provider, row["label"]),
            )
            return None
    return get_encryption().decrypt(row["access_token_encrypted"])


def _store_tokens(org_id: str, provider: str, label: str, client_id: str, spec: OAuthProviderSpec, tokens: dict[str, Any]) -> dict[str, Any]:
    label = (label or "").strip()[:120] or "default"
    access_token = str(tokens.get("access_token") or "")
    refresh_token = str(tokens.get("refresh_token") or "")
    expires_in = int(tokens.get("expires_in") or 3600)
    scope = str(tokens.get("scope") or spec.scopes)
    now = time.time()
    encrypt = get_encryption().encrypt
    if not label:
        raise OAuthError("label is required")

    existing = pg.query_one(
        "SELECT id FROM org_ai_oauth_accounts WHERE org_id = %s AND provider_name = %s AND label = %s",
        (org_id, provider, label),
    )
    if existing:
        pg.execute(
            "UPDATE org_ai_oauth_accounts SET access_token_encrypted = %s, refresh_token_encrypted = %s, scope = %s, "
            "status = 'connected', expires_at = %s, updated_at = %s WHERE id = %s",
            (encrypt(access_token), encrypt(refresh_token) if refresh_token else None, scope, now + expires_in, now, existing["id"]),
        )
        account_id = existing["id"]
    else:
        account_id = f"oa-{secrets.token_hex(6)}"
        pg.execute(
            "INSERT INTO org_ai_oauth_accounts (id, org_id, provider_name, label, client_id, access_token_encrypted, refresh_token_encrypted, scope, status, expires_at, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'connected', %s, %s, %s)",
            (account_id, org_id, provider, label, client_id, encrypt(access_token), encrypt(refresh_token) if refresh_token else None, scope, now + expires_in, now, now),
        )
    return {"id": account_id, "label": label, "provider": provider, "status": "connected", "expires_at": now + expires_in}


def _device_client_id(entry: Dict[str, str]) -> str:
    import os

    return os.environ.get(entry["client_id_env"], "").strip() or entry.get("default_client_id", "")


def begin_device_flow(org_id: str, provider: str, label: str) -> dict[str, Any]:
    """RFC 8628 device-authorization start; device_code stays server-side."""
    entry = OAUTH_DEVICE_PROVIDERS.get(provider)
    if not entry:
        raise OAuthError(f"Provider {provider} does not support the device flow", status=404)
    client_id = _device_client_id(entry)
    if not client_id:
        raise OAuthError(f"OAuth client for {provider} is not configured ({entry['client_id_env']})", status=503)
    state = secrets.token_urlsafe(24)
    payload: Dict[str, str] = {"client_id": client_id}
    if entry["scope"]:
        payload["scope"] = entry["scope"]
    req = urllib.request.Request(
        entry["device_code_url"],
        data=urllib.parse.urlencode(payload).encode("utf-8"),
        method="POST",
        headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with _opener(req, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise OAuthError("Device authorization endpoint unreachable", status=502) from exc
    device_code = str(data.get("device_code") or "")
    user_code = str(data.get("user_code") or "")
    verification_uri = str(data.get("verification_uri") or "")
    if not device_code or not user_code or not verification_uri:
        raise OAuthError("Device authorization endpoint returned an invalid payload", status=502)
    kv_set(
        "ai_oauth_flow",
        state,
        {
            "org_id": org_id,
            "provider": provider,
            "label": (label or "").strip()[:120] or "default",
            "device_code": device_code,
            "flow": "device",
            "created_at": time.time(),
        },
    )
    result: Dict[str, Any] = {
        "state": state,
        "user_code": user_code,
        "verification_uri": verification_uri,
        "interval": int(data.get("interval") or 5),
        "expires_in": int(data.get("expires_in") or 600),
    }
    if data.get("verification_uri_complete"):
        result["verification_uri_complete"] = str(data["verification_uri_complete"])
    return result


def complete_device_flow(org_id: str, provider: str, state: str) -> dict[str, Any]:
    """Poll the token endpoint once for the stored device flow.

    Returns {"status": "pending"} while the user has not approved, else the
    connected account summary.
    """
    entry = OAUTH_DEVICE_PROVIDERS.get(provider)
    if not entry:
        raise OAuthError(f"Provider {provider} does not support the device flow", status=404)
    flow = kv_get("ai_oauth_flow", state)
    if not isinstance(flow, dict) or flow.get("flow") != "device" or flow.get("org_id") != org_id or flow.get("provider") != provider:
        raise OAuthError("Unknown or expired OAuth state", status=400)
    if time.time() - float(flow.get("created_at") or 0) > FLOW_TTL_SECONDS:
        raise OAuthError("OAuth flow expired; restart the connection", status=400)
    client_id = _device_client_id(entry)
    req = urllib.request.Request(
        entry["token_url"],
        data=urllib.parse.urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "client_id": client_id,
            "device_code": flow["device_code"],
        }).encode("utf-8"),
        method="POST",
        headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with _opener(req, timeout=30) as response:
            tokens = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            parsed = json.loads(exc.read(1024).decode("utf-8", errors="replace"))
        except Exception:
            parsed = {}
        if isinstance(parsed, dict) and parsed.get("error") == "authorization_pending":
            return {"status": "pending"}
        raise OAuthError("Token endpoint rejected the device exchange", status=502) from exc
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise OAuthError("Token endpoint unreachable", status=502) from exc
    if not isinstance(tokens, dict) or not tokens.get("access_token"):
        raise OAuthError("Token endpoint rejected the device exchange", status=502)
    from storage.kv import kv_delete

    try:
        kv_delete("ai_oauth_flow", state)
    except Exception:
        pass
    account = _store_tokens(org_id, provider, flow["label"], client_id, _spec_shim(entry), tokens)
    return {"status": "connected", **account}


def _spec_shim(entry: Dict[str, str]) -> OAuthProviderSpec:
    return OAuthProviderSpec(
        entry.get("token_url", ""),
        "",
        entry["token_url"],
        entry.get("scope", ""),
        entry["client_id_env"],
    )


def import_token(
    org_id: str,
    provider: str,
    *,
    label: str,
    access_token: str,
    refresh_token: str = "",
    expires_in: int = 3600,
    scope: str = "",
) -> dict[str, Any]:
    """Encrypt and store an operator-supplied token (import_token/browser_token flows)."""
    if provider not in ALL_OAUTH_PROVIDER_NAMES:
        raise OAuthError(f"Unknown OAuth provider {provider}", status=404)
    if not access_token or len(access_token) > 8192:
        raise OAuthError("access_token is required")
    tokens = {"access_token": access_token, "expires_in": expires_in, "scope": scope}
    if refresh_token:
        tokens["refresh_token"] = refresh_token
    return _store_tokens(org_id, provider, label, "", _spec_shim({"token_url": "", "client_id_env": "", "scope": scope}), tokens)


def list_accounts(org_id: str) -> list[dict[str, Any]]:
    """Redacted account metadata — never token material."""
    return pg.query_all(
        "SELECT id, provider_name, label, status, scope, expires_at, created_at, updated_at "
        "FROM org_ai_oauth_accounts WHERE org_id = %s ORDER BY provider_name, label",
        (org_id,),
    )


def revoke(org_id: str, account_id: str) -> bool:
    row = pg.query_one("SELECT 1 AS x FROM org_ai_oauth_accounts WHERE id = %s AND org_id = %s", (account_id, org_id))
    if not row:
        return False
    pg.execute("DELETE FROM org_ai_oauth_accounts WHERE id = %s AND org_id = %s", (account_id, org_id))
    return True
