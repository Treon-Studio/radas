from __future__ import annotations

import base64
import hashlib
import io
import json
import time
import urllib.parse
import urllib.request
from functools import wraps
from unittest.mock import patch

import pytest
from flask import Flask, jsonify, request
from storage import pg

from services.ai_router import accounts as ai_accounts
from services.ai_router import oauth as oauth_module
from services.ai_router.oauth import OAuthError, begin_flow, complete_flow, get_valid_access_token

ORG_A = "99999999-9999-9999-9999-999999999999"
ORG_B = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

_HARNESS_USER = {"user_id": "user-a", "username": "tester", "roles": [], "org_id": ORG_A}


def _fake_require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        request.current_user = dict(_HARNESS_USER)
        request.token = "harness"
        return f(*args, **kwargs)

    return wrapper


@pytest.fixture
def app():
    with patch('auth.middleware.require_auth', _fake_require_auth):
        import sys
        if 'api.ai_router_routes' in sys.modules:
            del sys.modules['api.ai_router_routes']
        from api.ai_router_routes import bp as ai_router_bp

        app = Flask(__name__)
        app.config.update(TESTING=True)
        app.register_blueprint(ai_router_bp)

        @app.before_request
        def set_context():
            request.user_id = "user-a"
            request.user = dict(_HARNESS_USER)
            if not getattr(request, "current_user", None):
                request.current_user = dict(_HARNESS_USER)

        return app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture(autouse=True)
def _seed(pg_db, monkeypatch):
    for org_id, name in ((ORG_A, "OAuth Org"), (ORG_B, "Isolated Org")):
        pg.execute(
            "INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
            (org_id, name, time.time()),
        )
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (ORG_A, "user-a", "owner", time.time()),
    )
    monkeypatch.setenv("RADAS_OAUTH_CLAUDE_CLIENT_ID", "client-123")


class FakeTokenResponse:
    def __init__(self, payload: bytes, status: int = 200):
        self.payload = payload
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, *_args):
        return self.payload

    def close(self):
        pass


def _install_token_endpoint(monkeypatch, recorder: dict, tokens: dict | None = None, error: tuple[int, str] | None = None, error_on_grant: str | None = None):
    tokens = tokens or {"access_token": "at-live-secret", "refresh_token": "rt-live-secret", "expires_in": 3600, "scope": "user:profile"}

    def fake_opener(req, timeout=None):
        raw = req.data.decode("utf-8")
        try:
            body = json.loads(raw) if raw.startswith("{") else dict(urllib.parse.parse_qsl(raw))
        except json.JSONDecodeError:
            body = dict(urllib.parse.parse_qsl(raw))
        recorder.setdefault("calls", []).append({"url": req.full_url, "body": body})
        grant = body.get("grant_type") if isinstance(body, dict) else None
        if error and (error_on_grant is None or grant == error_on_grant):
            return FakeTokenResponse(json.dumps({"error": error[1]}).encode(), error[0])
        return FakeTokenResponse(json.dumps(tokens).encode())

    monkeypatch.setattr(oauth_module, "_opener", fake_opener)


def test_pkce_challenge_is_s256_of_verifier():
    verifier, challenge = oauth_module._pkce_pair()
    expected = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    assert challenge == expected
    assert 43 <= len(verifier) <= 128


def test_begin_flow_builds_authorize_url_and_stores_flow(pg_db):
    flow = begin_flow(ORG_A, "claude", "laptop", "http://127.0.0.1:9911/callback")
    assert flow["authorize_url"].startswith("https://claude.ai/oauth/authorize?")
    params = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(flow["authorize_url"]).query))
    assert params["client_id"] == "client-123"
    assert params["code_challenge_method"] == "S256"
    assert params["state"] == flow["state"]
    # The verifier must never travel through the authorize URL.
    assert flow["state"] not in params.get("code_challenge", "")
    stored = oauth_module.kv_get("ai_oauth_flow", flow["state"])
    assert stored["code_verifier"] and stored["org_id"] == ORG_A


def test_begin_flow_rejects_unknown_provider_and_bad_redirect(pg_db):
    with pytest.raises(OAuthError, match="Unknown OAuth provider"):
        begin_flow(ORG_A, "cursor", "x", "http://127.0.0.1:1/cb")
    with pytest.raises(OAuthError, match="redirect_uri"):
        begin_flow(ORG_A, "claude", "x", "http://evil.test/cb")


def test_complete_flow_exchanges_and_encrypts(pg_db, monkeypatch):
    recorder: dict = {}
    _install_token_endpoint(monkeypatch, recorder)
    flow = begin_flow(ORG_A, "claude", "laptop", "http://127.0.0.1:9911/callback")

    account = complete_flow(ORG_A, "claude", "auth-code-xyz", flow["state"])
    assert account["status"] == "connected"

    call = recorder["calls"][0]
    assert call["url"] == "https://api.anthropic.com/v1/oauth/token"
    assert call["body"]["grant_type"] == "authorization_code"
    assert call["body"]["code"] == "auth-code-xyz"
    assert "code_verifier" in call["body"]

    row = pg.query_one("SELECT * FROM org_ai_oauth_accounts WHERE id = %s", (account["id"],))
    assert row["access_token_encrypted"] != "at-live-secret"
    assert oauth_module.get_encryption().decrypt(row["access_token_encrypted"]) == "at-live-secret"
    assert oauth_module.get_encryption().decrypt(row["refresh_token_encrypted"]) == "rt-live-secret"

    # State is single-use.
    with pytest.raises(OAuthError, match="Unknown or expired"):
        complete_flow(ORG_A, "claude", "auth-code-2", flow["state"])


def test_complete_flow_rejects_cross_org_state(pg_db):
    flow = begin_flow(ORG_A, "claude", "x", "http://127.0.0.1:1/cb")
    with pytest.raises(OAuthError, match="different organization"):
        complete_flow(ORG_B, "claude", "code", flow["state"])


def test_expired_token_refreshes(pg_db, monkeypatch):
    recorder: dict = {}
    _install_token_endpoint(monkeypatch, recorder, tokens={"access_token": "at-refreshed", "refresh_token": "rt-2", "expires_in": 7200, "scope": "user:profile"})
    flow = begin_flow(ORG_A, "claude", "laptop", "http://127.0.0.1:1/cb")
    complete_flow(ORG_A, "claude", "code", flow["state"])

    pg.execute(
        "UPDATE org_ai_oauth_accounts SET expires_at = %s WHERE org_id = %s",
        (time.time() - 10, ORG_A),
    )
    token = get_valid_access_token(ORG_A, "claude")
    assert token == "at-refreshed"
    assert recorder["calls"][-1]["body"]["grant_type"] == "refresh_token"
    # Refresh tokens are re-encrypted after rotation.
    row = pg.query_one("SELECT refresh_token_encrypted FROM org_ai_oauth_accounts WHERE org_id = %s", (ORG_A,))
    assert oauth_module.get_encryption().decrypt(row["refresh_token_encrypted"]) == "rt-2"


def test_refresh_failure_marks_error_and_returns_none(pg_db, monkeypatch):
    recorder: dict = {}
    _install_token_endpoint(monkeypatch, recorder, error=(400, "invalid_grant"), error_on_grant="refresh_token")
    flow = begin_flow(ORG_A, "claude", "laptop", "http://127.0.0.1:1/cb")
    complete_flow(ORG_A, "claude", "code", flow["state"])
    pg.execute("UPDATE org_ai_oauth_accounts SET expires_at = %s WHERE org_id = %s", (time.time() - 10, ORG_A))

    assert get_valid_access_token(ORG_A, "claude") is None
    row = pg.query_one("SELECT status FROM org_ai_oauth_accounts WHERE org_id = %s", (ORG_A,))
    assert row["status"] == "error"


def test_oauth_credentials_rank_ahead_of_env(pg_db, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    recorder: dict = {}
    _install_token_endpoint(monkeypatch, recorder)
    flow = begin_flow(ORG_A, "claude", "laptop", "http://127.0.0.1:1/cb")
    complete_flow(ORG_A, "claude", "code", flow["state"])

    credentials = ai_accounts.gather_credentials(ORG_A, "anthropic", "ANTHROPIC_API_KEY")
    assert credentials and credentials[0]["api_key"] == "at-live-secret"

    # Org isolation: org B gets nothing.
    assert ai_accounts.gather_credentials(ORG_B, "anthropic", "ANTHROPIC_API_KEY") == []


def test_oauth_routes_round_trip(pg_db, client, monkeypatch):
    recorder: dict = {}
    _install_token_endpoint(monkeypatch, recorder)

    res_providers = client.get(f"/api/orgs/{ORG_A}/ai/oauth/providers")
    providers = res_providers.get_json()["providers"]
    assert any(p["provider"] == "claude" and p["client_configured"] for p in providers)

    res_begin = client.post(
        f"/api/orgs/{ORG_A}/ai/oauth/claude/begin",
        json={"label": "laptop", "redirect_uri": "http://127.0.0.1:9911/callback"},
    )
    assert res_begin.status_code == 201
    flow = res_begin.get_json()

    res_complete = client.post(
        f"/api/orgs/{ORG_A}/ai/oauth/claude/complete",
        json={"code": "auth-code", "state": flow["state"]},
    )
    assert res_complete.status_code == 201

    res_list = client.get(f"/api/orgs/{ORG_A}/ai/oauth/accounts")
    accounts = res_list.get_json()["accounts"]
    assert any(a["label"] == "laptop" and a["status"] == "connected" for a in accounts)
    assert all("access_token" not in json.dumps(a) and "at-live-secret" not in json.dumps(a) for a in accounts)

    account_id = accounts[0]["id"]
    assert client.delete(f"/api/orgs/{ORG_A}/ai/oauth/accounts/{account_id}").status_code == 200
    assert client.get(f"/api/orgs/{ORG_A}/ai/oauth/accounts").get_json()["accounts"] == []


def test_begin_flow_requires_owner_role(pg_db, client):
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (ORG_B, "user-a", "member", time.time()),
    )
    res = client.post(
        f"/api/orgs/{ORG_B}/ai/oauth/claude/begin",
        json={"label": "x", "redirect_uri": "http://127.0.0.1:1/cb"},
    )
    assert res.status_code == 403


def test_device_flow_round_trip(pg_db, monkeypatch):
    monkeypatch.setenv("RADAS_OAUTH_KIMI_CLIENT_ID", "kimi-client")
    recorder = {"calls": []}

    def fake_opener(req, timeout=None):
        raw = req.data.decode("utf-8")
        body = dict(urllib.parse.parse_qsl(raw))
        recorder["calls"].append({"url": req.full_url, "body": body})
        if "device_authorization" in req.full_url:
            return FakeTokenResponse(json.dumps({
                "device_code": "dev-code-1", "user_code": "ABCD-1234",
                "verification_uri": "https://auth.kimi.com/device",
                "verification_uri_complete": "https://auth.kimi.com/device?code=ABCD-1234",
                "interval": 5, "expires_in": 300,
            }).encode())
        return FakeTokenResponse(json.dumps({"access_token": "kimi-at", "refresh_token": "kimi-rt", "expires_in": 3600}).encode())

    monkeypatch.setattr(oauth_module, "_opener", fake_opener)

    flow = oauth_module.begin_device_flow(ORG_A, "kimi", "kimi-acct")
    assert flow["user_code"] == "ABCD-1234"
    assert flow["verification_uri_complete"].endswith("code=ABCD-1234")
    # device_code never leaves the server side
    assert "device_code" not in json.dumps(flow)

    result = oauth_module.complete_device_flow(ORG_A, "kimi", flow["state"])
    assert result["status"] == "connected"
    poll = recorder["calls"][-1]
    assert poll["body"]["grant_type"] == "urn:ietf:params:oauth:grant-type:device_code"
    assert poll["body"]["device_code"] == "dev-code-1"

    row = pg.query_one("SELECT access_token_encrypted, refresh_token_encrypted FROM org_ai_oauth_accounts WHERE provider_name = %s", ("kimi",))
    assert oauth_module.get_encryption().decrypt(row["access_token_encrypted"]) == "kimi-at"

    # state single-use
    with pytest.raises(OAuthError, match="Unknown or expired"):
        oauth_module.complete_device_flow(ORG_A, "kimi", flow["state"])


def test_device_flow_pending(pg_db, monkeypatch):
    monkeypatch.setenv("RADAS_OAUTH_KIMI_CLIENT_ID", "kimi-client")

    import io
    import urllib.error

    def fake_opener(req, timeout=None):
        if "device_authorization" in req.full_url:
            return FakeTokenResponse(json.dumps({"device_code": "dc", "user_code": "U", "verification_uri": "https://x", "interval": 5}).encode())
        raise urllib.error.HTTPError(req.full_url, 400, "pending", {}, io.BytesIO(b'{"error":"authorization_pending"}'))

    monkeypatch.setattr(oauth_module, "_opener", fake_opener)

    flow = oauth_module.begin_device_flow(ORG_A, "kimi", "x")
    result = oauth_module.complete_device_flow(ORG_A, "kimi", flow["state"])
    assert result == {"status": "pending"}


def test_import_token_round_trip(pg_db):
    account = oauth_module.import_token(
        ORG_A, "cursor", label="work", access_token="cursor-secret-token",
        refresh_token="cursor-rt", expires_in=7200, scope="read",
    )
    assert account["status"] == "connected"
    row = pg.query_one("SELECT * FROM org_ai_oauth_accounts WHERE id = %s", (account["id"],))
    assert row["provider_name"] == "cursor"
    assert "cursor-secret-token" not in row["access_token_encrypted"]
    assert oauth_module.get_encryption().decrypt(row["access_token_encrypted"]) == "cursor-secret-token"

    # usable as gateway credential (cursor is an import-capable provider name)
    from services.ai_router import accounts as ai_accounts
    creds = ai_accounts.gather_credentials(ORG_A, "cursor", "")
    assert creds and creds[0]["api_key"] == "cursor-secret-token"


def test_import_token_rejects_unknown_provider(pg_db):
    with pytest.raises(OAuthError, match="Unknown OAuth provider"):
        oauth_module.import_token(ORG_A, "not-a-provider", label="x", access_token="t")


def test_registry_covers_device_and_import_providers():
    assert set(oauth_module.OAUTH_DEVICE_PROVIDERS) == {"kimi", "grok-cli", "github-device"}
    assert "cursor" in oauth_module.OAUTH_IMPORT_PROVIDERS
    assert "kimchi" in oauth_module.OAUTH_IMPORT_PROVIDERS
    # union covers the remaining upstream providers beyond the 7 auth-code ones
    assert len(oauth_module.ALL_OAUTH_PROVIDER_NAMES) == 17
    # 7 auth-code + 3 device entries + 7 import providers (github-device aliases github)
    assert {"kimi", "grok-cli", "github-device"} <= set(oauth_module.ALL_OAUTH_PROVIDER_NAMES)


def test_device_and_import_routes(pg_db, client, monkeypatch):
    monkeypatch.setenv("RADAS_OAUTH_KIMI_CLIENT_ID", "kimi-client")

    def fake_opener(req, timeout=None):
        raw = req.data.decode("utf-8")
        body = dict(urllib.parse.parse_qsl(raw))
        if "device_authorization" in req.full_url:
            return FakeTokenResponse(json.dumps({"device_code": "dc", "user_code": "U", "verification_uri": "https://auth.kimi.com/device"}).encode())
        return FakeTokenResponse(json.dumps({"access_token": "at", "expires_in": 3600}).encode())

    monkeypatch.setattr(oauth_module, "_opener", fake_opener)

    res_providers = client.get(f"/api/orgs/{ORG_A}/ai/oauth/providers")
    flows = {p["provider"]: p["flow"] for p in res_providers.get_json()["providers"]}
    assert flows["claude"] == "authorization_code"
    assert flows["kimi"] == "device_code"
    assert flows["cursor"] == "import_token"

    begin = client.post(f"/api/orgs/{ORG_A}/ai/oauth/kimi/device/begin", json={"label": "k1"})
    assert begin.status_code == 201
    complete = client.post(f"/api/orgs/{ORG_A}/ai/oauth/kimi/device/complete", json={"state": begin.get_json()["state"]})
    assert complete.status_code == 201
    assert complete.get_json()["status"] == "connected"

    imp = client.post(
        f"/api/orgs/{ORG_A}/ai/oauth/cursor/import-token",
        json={"label": "c1", "access_token": "at-import", "refresh_token": "rt-import"},
    )
    assert imp.status_code == 201
    body = client.get(f"/api/orgs/{ORG_A}/ai/oauth/accounts").get_data(as_text=True)
    assert "at-import" not in body and "rt-import" not in body
