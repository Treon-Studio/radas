from __future__ import annotations

import json
import time
from functools import wraps
from unittest.mock import patch

import pytest
from flask import Flask, jsonify, request
from storage import pg

from services.ai_router import proxy_pools

ORG_A = "dddddddd-dddd-dddd-dddd-dddddddddddd"

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
def _seed(pg_db):
    pg.execute(
        "INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
        (ORG_A, "Proxy Org", time.time()),
    )
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (ORG_A, "user-a", "owner", time.time()),
    )


def test_upsert_validates_and_encrypts(pg_db, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(proxy_pools.ProxyPoolError, match="http\\(s\\)"):
        proxy_pools.upsert_pool(ORG_A, "bad", "socks5://proxy.internal:1080")
    with pytest.raises(proxy_pools.ProxyPoolError, match="required"):
        proxy_pools.upsert_pool(ORG_A, "bad", "")

    created = proxy_pools.upsert_pool(ORG_A, "main", "http://user:secret@egress.internal:3128")
    assert created["label"] == "main"

    row = pg.query_one("SELECT proxy_url_encrypted FROM org_ai_proxy_pools WHERE id = %s", (created["id"],))
    # Encrypted at rest: the credential-bearing URL never appears in plaintext.
    assert "user:secret" not in row["proxy_url_encrypted"]
    decrypted = proxy_pools.get_encryption().decrypt(row["proxy_url_encrypted"])
    assert decrypted == "http://user:secret@egress.internal:3128"


def test_resolve_rotates_between_active_pools(pg_db):
    proxy_pools.upsert_pool(ORG_A, "p1", "http://p1.internal:3128")
    proxy_pools.upsert_pool(ORG_A, "p2", "http://p2.internal:3128")

    first = proxy_pools.resolve_proxy_url(ORG_A)
    second = proxy_pools.resolve_proxy_url(ORG_A)
    third = proxy_pools.resolve_proxy_url(ORG_A)

    assert {first, second} == {"http://p1.internal:3128", "http://p2.internal:3128"}
    assert third in {first, second}


def test_gateway_with_proxy_is_cached_and_bound(pg_db):
    from services.ai_router.gateway import OpenAIGateway
    import urllib.request

    gw = proxy_pools.gateway_with_proxy("http://p1.internal:3128")
    assert isinstance(gw, OpenAIGateway)
    assert proxy_pools.gateway_with_proxy("http://p1.internal:3128") is gw
    assert gw._opener is not urllib.request.urlopen


def test_routes_round_trip_and_redaction(pg_db, client):
    res = client.post(
        f"/api/orgs/{ORG_A}/ai/proxy-pools",
        json={"label": "main", "proxy_url": "http://user:secret@egress.internal:3128"},
    )
    assert res.status_code == 201
    pool_id = res.get_json()["id"]

    res_list = client.get(f"/api/orgs/{ORG_A}/ai/proxy-pools")
    body = res_list.get_data(as_text=True)
    assert any(p["id"] == pool_id and p["label"] == "main" for p in res_list.get_json()["pools"])
    assert "secret" not in body and "proxy_url" not in body

    assert client.delete(f"/api/orgs/{ORG_A}/ai/proxy-pools/{pool_id}").status_code == 200
    assert client.delete(f"/api/orgs/{ORG_A}/ai/proxy-pools/{pool_id}").status_code == 404


def test_proxy_pool_test_endpoint(pg_db, client, monkeypatch):
    created = proxy_pools.upsert_pool(ORG_A, "main", "http://egress.internal:3128")

    class FakeEgress:
        status = 204

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    seen = {}
    import urllib.request

    real_build = urllib.request.build_opener

    def fake_build(handler):
        seen["handler"] = handler
        class Opener:
            def open(self, req, timeout=None):
                seen["url"] = req.full_url
                return FakeEgress()
        return Opener()

    monkeypatch.setattr(urllib.request, "build_opener", fake_build)
    res = client.post(f"/api/orgs/{ORG_A}/ai/proxy-pools/{created['id']}/test", json={})
    assert res.status_code == 200
    body = res.get_json()
    assert body["ok"] is True and body["status"] == 204
    assert seen["url"] == "https://api.openai.com/v1/models"
    # The opener must carry the org's proxy binding.
    assert seen["handler"].proxies["https"] == "http://egress.internal:3128"
    monkeypatch.setattr(urllib.request, "build_opener", real_build)


def test_chat_uses_proxy_bound_gateway(pg_db, client, monkeypatch):
    proxy_pools.upsert_pool(ORG_A, "main", "http://egress.internal:3128")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-proxy-test")

    import api.ai_router_routes as routes

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, *_args):
            return json.dumps({"choices": [{"message": {"role": "assistant", "content": "hi"}}], "usage": {"prompt_tokens": 1, "completion_tokens": 1}}).encode()

    assert routes._gateway_for(ORG_A) is not routes._GATEWAY  # proxy-bound instance

    # With no pool, the default gateway instance is used (monkeypatch-compatible).
    proxy_pools.delete_pool(ORG_A, pg.query_one("SELECT id FROM org_ai_proxy_pools WHERE org_id = %s", (ORG_A,))["id"])
    assert routes._gateway_for(ORG_A) is routes._GATEWAY
