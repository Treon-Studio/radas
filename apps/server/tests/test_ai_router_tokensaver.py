from __future__ import annotations

import json
import time
from functools import wraps
from unittest.mock import patch

import pytest
from flask import Flask, jsonify, request
from storage import pg

from services.ai_router.oauth import OAUTH_PROVIDERS
from services.ai_router.ponytail import apply_ponytail, ponytail_prompt

ORG_A = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

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
def _seed(pg_db, monkeypatch):
    pg.execute(
        "INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
        (ORG_A, "TokenSaver Org", time.time()),
    )
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (ORG_A, "user-a", "owner", time.time()),
    )
    monkeypatch.delenv("HEADROOM_URL", raising=False)


class FakeResponse:
    def __init__(self, payload: bytes):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, *_args):
        return self.payload

    def close(self):
        pass


def test_oauth_registry_covers_all_complete_auth_code_providers():
    # Upstream providers whose oauth block carries BOTH authorize and token URLs.
    expected = {"claude", "codex", "github", "gemini-cli", "antigravity", "clinepass", "iflow"}
    assert set(OAUTH_PROVIDERS) == expected
    for spec in OAUTH_PROVIDERS.values():
        assert spec.authorize_url.startswith("https://")
        assert spec.token_url.startswith("https://")
        assert spec.client_id_env.startswith("RADAS_OAUTH_")


def test_codex_and_github_default_client_ids(pg_db, monkeypatch):
    from services.ai_router.oauth import begin_flow, _client_id

    assert _client_id(OAUTH_PROVIDERS["codex"]) == "app_EMoamEEZ73f0CkXaXp7hrann"
    assert _client_id(OAUTH_PROVIDERS["github"]) == "Iv1.b507a08c87ecfe98"
    # Env overrides always win.
    monkeypatch.setenv("RADAS_OAUTH_CODEX_CLIENT_ID", "custom-codex")
    assert _client_id(OAUTH_PROVIDERS["codex"]) == "custom-codex"

    flow = begin_flow(ORG_A, "codex", "x", "http://127.0.0.1:1/cb")
    assert "auth.openai.com/oauth/authorize" in flow["authorize_url"]
    assert "client-123" not in flow["authorize_url"] or "client_id=app_" in flow["authorize_url"]


def test_ggateway_alias_includes_gemini_cli():
    from services.ai_router.oauth import oauth_provider_name

    assert oauth_provider_name("google") == "gemini-cli"
    assert oauth_provider_name("anthropic") == "claude"
    assert oauth_provider_name("deepseek") is None


def test_ponytail_injects_into_existing_system_message():
    messages = [
        {"role": "system", "content": "Be helpful."},
        {"role": "user", "content": "write a util"},
    ]
    out = apply_ponytail(messages, "full")
    assert out[0]["role"] == "system"
    assert out[0]["content"].startswith("Be helpful.")
    assert "lazy senior developer" in out[0]["content"]
    assert out[1]["content"] == "write a util"
    # Input is not mutated.
    assert messages[0]["content"] == "Be helpful."


def test_ponytail_creates_system_message_when_absent():
    out = apply_ponytail([{"role": "user", "content": "x"}], "ultra")
    assert out[0]["role"] == "system"
    assert "smallest possible diff" in out[0]["content"]
    with pytest.raises(ValueError):
        ponytail_prompt("nope")


def test_ponytail_header_flows_into_chat(pg_db, client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-ponytail-test")
    import api.ai_router_routes as routes

    captured = {}

    class FakeGateway:
        def complete(self, target, payload):
            captured["messages"] = payload["messages"]
            return {"choices": [{"message": {"role": "assistant", "content": "ok"}}], "usage": {"prompt_tokens": 1, "completion_tokens": 1}}

    original = routes._GATEWAY
    routes._GATEWAY = FakeGateway()
    try:
        res = client.post(
            "/api/v1/chat/completions",
            json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]},
            headers={"X-9Router-Ponytail": "lite"},
        )
    finally:
        routes._GATEWAY = original
    assert res.status_code == 200
    roles = [m["role"] for m in captured["messages"]]
    assert "system" in roles
    assert any("lazy senior developer" in str(m.get("content")) for m in captured["messages"])

    res_plain = client.post(
        "/api/v1/chat/completions",
        json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert res_plain.status_code == 200


def test_compress_endpoint_local_rtk(pg_db, client):
    payload = {
        "messages": [
            {"role": "user", "content": "unique line " + "\n".join(f"row {i}" for i in range(50))},
            {"role": "user", "content": "short"},
        ]
    }
    res = client.post("/api/v1/compress", json=payload)
    assert res.status_code == 200
    body = res.get_json()
    assert body["mode"] == "rtk-local"
    assert body["messages"][1]["content"] == "short"
    assert "tokens_saved" in body


def test_compress_endpoint_requires_messages(pg_db, client):
    res = client.post("/api/v1/compress", json={})
    assert res.status_code == 400


def test_compress_endpoint_forwards_to_headroom(pg_db, client, monkeypatch):
    monkeypatch.setenv("HEADROOM_URL", "https://headroom.internal")

    seen = {}

    class FakeOpenerResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, *_args):
            return json.dumps({"messages": [{"role": "user", "content": "compressed-by-headroom"}], "tokens_saved": 999}).encode()

        def close(self):
            pass

    def fake_opener(req, timeout=None):
        seen["url"] = req.full_url
        return FakeOpenerResponse()

    import urllib.request
    monkeypatch.setattr(urllib.request, "urlopen", fake_opener)

    res = client.post("/api/v1/compress", json={"messages": [{"role": "user", "content": "long payload..."}]})
    assert res.status_code == 200
    body = res.get_json()
    assert body["mode"] == "headroom"
    assert body["messages"][0]["content"] == "compressed-by-headroom"
    assert seen["url"] == "https://headroom.internal/v1/compress"


def test_compress_endpoint_fails_open_when_headroom_down(pg_db, client, monkeypatch):
    monkeypatch.setenv("HEADROOM_URL", "https://headroom.internal")

    import urllib.request

    def boom(*args, **kwargs):
        raise OSError("headroom down")

    monkeypatch.setattr(urllib.request, "urlopen", boom)

    res = client.post("/api/v1/compress", json={"messages": [{"role": "user", "content": "tiny"}]})
    assert res.status_code == 200
    body = res.get_json()
    assert body["mode"] == "rtk-local"
    assert body["messages"][0]["content"] == "tiny"
