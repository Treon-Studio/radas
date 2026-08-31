from __future__ import annotations

import time
from functools import wraps
from unittest.mock import patch

import pytest
from flask import Flask, jsonify, request
from storage import pg

from services.ai_router import accounts as ai_accounts
from services.ai_router import endpoint_keys as epk

ORG_A = "11111111-1111-1111-1111-111111111111"
ORG_B = "22222222-2222-2222-2222-222222222222"

_HARNESS_USER = {"user_id": "user-a", "username": "tester", "roles": [], "org_id": ORG_A}


def _fake_require_auth(f):
    """Mimic production require_auth: gateway keys are not RADAS tokens."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization") or ""
        token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else ""
        if token.startswith("radas_epk_") or (request.headers.get("X-Api-Key") or "").startswith("radas_epk_"):
            return jsonify({"error": "Invalid token", "message": "Access token is invalid or expired"}), 401
        request.current_user = dict(_HARNESS_USER)
        request.token = token or "harness"
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
        app.register_blueprint(ai_router_bp)

        @app.before_request
        def set_context():
            request.user_id = "user-a"
            request.user = dict(_HARNESS_USER)
            # require_auth normally populates this; the fake middleware above
            # mirrors that so the real membership/role checks are exercised.
            if not getattr(request, "current_user", None):
                request.current_user = dict(_HARNESS_USER)

        return app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture(autouse=True)
def _seed_orgs(pg_db):
    for org_id, name in ((ORG_A, "Org A"), (ORG_B, "Org B")):
        pg.execute(
            "INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
            (org_id, name, time.time()),
        )
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (ORG_A, "user-a", "owner", time.time()),
    )


def _add_account(org_id: str, provider: str, label: str, key: str, priority: int = 100):
    pg.execute(
        "INSERT INTO org_ai_provider_accounts (id, org_id, provider_name, label, api_key_encrypted, base_url, priority, is_active, created_at, updated_at) "
        "VALUES (%s, %s, %s, %s, %s, '', %s, TRUE, %s, %s)",
        (f"acct-{label}", org_id, provider, label, key, priority, time.time(), time.time()),
    )


def test_gather_credentials_prefers_priority_over_rotation(pg_db, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    _add_account(ORG_A, "openai", "low", "sk-low", priority=200)
    _add_account(ORG_A, "openai", "high", "sk-high", priority=10)

    first = ai_accounts.gather_credentials(ORG_A, "openai", "OPENAI_API_KEY")
    second = ai_accounts.gather_credentials(ORG_A, "openai", "OPENAI_API_KEY")

    assert [c["api_key"] for c in first] == ["sk-high", "sk-low"]
    # Priority wins on every call; equal-priority accounts are the ones rotating.
    assert [c["api_key"] for c in second] == ["sk-high", "sk-low"]


def test_gather_credentials_rotates_equal_priority(pg_db, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    _add_account(ORG_A, "anthropic", "one", "sk-one")
    _add_account(ORG_A, "anthropic", "two", "sk-two")

    first = ai_accounts.gather_credentials(ORG_A, "anthropic", "ANTHROPIC_API_KEY")
    second = ai_accounts.gather_credentials(ORG_A, "anthropic", "ANTHROPIC_API_KEY")

    assert [c["api_key"] for c in first] == ["sk-one", "sk-two"]
    assert [c["api_key"] for c in second] == ["sk-two", "sk-one"]


def test_gather_credentials_falls_back_to_vault_then_env(pg_db, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert ai_accounts.gather_credentials(ORG_A, "openai", "OPENAI_API_KEY") == []

    monkeypatch.setenv("OPENAI_API_KEY", "sk-env")
    env_only = ai_accounts.gather_credentials(ORG_A, "openai", "OPENAI_API_KEY")
    assert [c["api_key"] for c in env_only] == ["sk-env"]

    pg.execute(
        "INSERT INTO org_ai_providers (id, org_id, provider_name, api_key_encrypted, base_url, is_active, rate_limit_per_min, created_at, updated_at) "
        "VALUES (%s, %s, %s, %s, '', TRUE, 60, %s, %s)",
        ("prov-default", ORG_A, "openai", "sk-vault", time.time(), time.time()),
    )
    vault = ai_accounts.gather_credentials(ORG_A, "openai", "OPENAI_API_KEY")
    assert [c["api_key"] for c in vault] == ["sk-vault"]


def test_gather_credentials_is_org_scoped(pg_db, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    _add_account(ORG_B, "openai", "b-key", "sk-org-b")
    assert ai_accounts.gather_credentials(ORG_A, "openai", "OPENAI_API_KEY") == []
    assert [c["api_key"] for c in ai_accounts.gather_credentials(ORG_B, "openai", "OPENAI_API_KEY")] == ["sk-org-b"]


def test_endpoint_key_authenticates_gateway(client, pg_db):
    created = epk.create_key(ORG_A, "ci-client")

    res = client.get("/api/v1/models", headers={"X-Api-Key": created["key"]})
    assert res.status_code == 200
    assert "data" in res.get_json()

    res_bearer = client.get("/api/v1/models", headers={"Authorization": f"Bearer {created['key']}"})
    assert res_bearer.status_code == 200


def test_endpoint_key_rejects_invalid_and_revoked(client, pg_db):
    res = client.get("/api/v1/models", headers={"X-Api-Key": "radas_epk_not-a-real-key"})
    assert res.status_code == 401

    created = epk.create_key(ORG_A)
    assert epk.revoke(ORG_A, created["id"]) is True
    res_revoked = client.get("/api/v1/models", headers={"X-Api-Key": created["key"]})
    assert res_revoked.status_code == 401


def test_endpoint_key_cannot_mutate_or_cross_org(client, pg_db):
    created = epk.create_key(ORG_A, "limited")

    res_list_b = client.get(f"/api/orgs/{ORG_B}/ai/providers", headers={"X-Api-Key": created["key"]})
    # Production require_auth rejects a foreign gateway key outright (401);
    # endpoint-key org pinning is asserted separately at the identity level.
    assert res_list_b.status_code in (401, 403)

    res_create = client.post(
        f"/api/orgs/{ORG_A}/ai/endpoint-keys",
        json={"label": "escalate"},
        headers={"X-Api-Key": created["key"]},
    )
    # Production require_auth rejects a gateway key outright (401); the exact
    # status is middleware-owned, the guarantee is "never 2xx".
    assert res_create.status_code in (401, 403)


def test_endpoint_identity_is_rejected_for_mutations():
    """The gateway-auth identity (endpoint key) is read-only and org-pinned."""
    from api.ai_router_routes import _org_access

    app = Flask(__name__)
    with app.test_request_context("/api/v1/models"):
        request.current_user = {
            "user_id": "__endpoint__",
            "username": "endpoint:abc",
            "roles": ["endpoint"],
            "org_id": ORG_A,
            "endpoint_key": True,
        }
        assert _org_access(ORG_A) is None
        denial = _org_access(ORG_A, mutate=True)
        assert denial is not None and denial[1] == 403
        cross_org = _org_access(ORG_B)
        assert cross_org is not None and cross_org[1] == 403


def test_endpoint_key_listing_never_exposes_secret(client, pg_db):
    created = epk.create_key(ORG_A, "safe")

    res = client.get(f"/api/orgs/{ORG_A}/ai/endpoint-keys")
    assert res.status_code == 200
    body = res.get_data(as_text=True)
    assert created["key"] not in body
    assert "key_hash" not in body
    assert any(entry["key_prefix"] == created["key_prefix"] for entry in res.get_json()["keys"])


def test_account_routes_round_trip(client, pg_db):
    res_create = client.post(
        f"/api/orgs/{ORG_A}/ai/accounts",
        json={"provider_name": "openai", "label": "primary", "api_key": "sk-live-1", "priority": 5},
    )
    assert res_create.status_code == 201
    account_id = res_create.get_json()["id"]

    res_list = client.get(f"/api/orgs/{ORG_A}/ai/accounts")
    assert res_list.status_code == 200
    accounts = res_list.get_json()["accounts"]
    assert any(a["id"] == account_id and a["label"] == "primary" for a in accounts)
    assert all("api_key_encrypted" not in a and "sk-live-1" not in a for a in accounts)

    res_delete = client.delete(f"/api/orgs/{ORG_A}/ai/accounts/{account_id}")
    assert res_delete.status_code == 200
    assert client.delete(f"/api/orgs/{ORG_A}/ai/accounts/{account_id}").status_code == 404


def test_account_validation_rejects_bad_input(client, pg_db):
    res_bad_provider = client.post(
        f"/api/orgs/{ORG_A}/ai/accounts",
        json={"provider_name": "bad name!", "label": "x", "api_key": "sk-1"},
    )
    assert res_bad_provider.status_code == 400

    res_bad_url = client.post(
        f"/api/orgs/{ORG_A}/ai/accounts",
        json={"provider_name": "openai", "label": "x", "api_key": "sk-1", "base_url": "https://user:pass@evil.test"},
    )
    assert res_bad_url.status_code == 400

    res_missing = client.post(f"/api/orgs/{ORG_A}/ai/accounts", json={"provider_name": "openai", "label": "x"})
    assert res_missing.status_code == 400


def test_chat_completion_uses_rotating_account_keys(pg_db, client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    _add_account(ORG_A, "openai", "a1", "sk-rot-1")
    _add_account(ORG_A, "openai", "a2", "sk-rot-2")

    seen: list[str] = []

    class FakeResponse:
        def __init__(self, payload: bytes):
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, *_args):
            return self.payload

    def opener(req, timeout=None):
        seen.append(req.headers["Authorization"])
        return FakeResponse(b'{"id":"1","choices":[{"message":{"role":"assistant","content":"hi"}}],"usage":{"prompt_tokens":1,"completion_tokens":1}}')

    from services.ai_router.gateway import OpenAIGateway
    import api.ai_router_routes as routes

    original = routes._GATEWAY
    routes._GATEWAY = OpenAIGateway(opener=opener)
    try:
        for _ in range(2):
            res = client.post("/api/v1/chat/completions", json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]})
            assert res.status_code == 200
    finally:
        routes._GATEWAY = original

    assert sorted(seen) == ["Bearer sk-rot-1", "Bearer sk-rot-2"]
