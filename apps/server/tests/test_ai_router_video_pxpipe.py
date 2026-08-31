from __future__ import annotations

import json
import time
from functools import wraps
from unittest.mock import patch

import pytest
from flask import Flask, jsonify, request
from storage import pg

from services.ai_router.pxpipe import compress_with_pxpipe

ORG_A = "cccccccc-cccc-cccc-cccc-cccccccccccc"

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
        (ORG_A, "Video Org", time.time()),
    )
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (ORG_A, "user-a", "owner", time.time()),
    )
    monkeypatch.setenv("XAI_API_KEY", "sk-xai-video")
    monkeypatch.delenv("PXPIPE_URL", raising=False)


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


def test_video_create_strips_provider_prefix(pg_db, client, monkeypatch):
    from services.ai_router.gateway import OpenAIGateway
    import api.ai_router_routes as routes

    seen = {}

    class FakeVideoGateway(OpenAIGateway):
        def video_create(self, target, payload, action):
            seen["target"] = (target.name, target.model)
            seen["payload"] = dict(payload)
            seen["action"] = action
            return {"request_id": "vid-123", "status": "queued"}

    monkeypatch.setattr(routes, "_GATEWAY", FakeVideoGateway())

    res = client.post(
        "/api/v1/videos/generations",
        json={"model": "xai/grok-imagine-video", "prompt": "a rocket launch", "duration": 6},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["request_id"] == "vid-123"
    assert seen["target"] == ("xai", "grok-imagine-video")
    assert seen["action"] == "generations"
    assert seen["payload"]["prompt"] == "a rocket launch"
    assert res.headers["X-9Router-Provider"] == "xai"

    logs = client.get(f"/api/orgs/{ORG_A}/ai/logs").get_json()["logs"]
    assert any(row["endpoint"] == "video" and row["resolved_provider"] == "xai" for row in logs)


def test_video_status_poll(pg_db, client, monkeypatch):
    from services.ai_router.gateway import OpenAIGateway
    import api.ai_router_routes as routes

    seen = {}

    class FakeVideoGateway(OpenAIGateway):
        def video_status(self, target, video_id):
            seen = {"target": target.name, "id": video_id}
            self.last_seen = seen
            return {"request_id": video_id, "status": "done", "url": "https://video.test/1.mp4"}

    gateway = FakeVideoGateway()
    monkeypatch.setattr(routes, "_GATEWAY", gateway)

    res = client.get("/api/v1/videos/vid-123")
    assert res.status_code == 200
    assert res.get_json()["status"] == "done"
    assert gateway.last_seen["id"] == "vid-123"


def test_video_rejects_provider_without_capability(pg_db, client):
    res = client.post(
        "/api/v1/videos/generations",
        json={"model": "gpt-4o-mini", "prompt": "x", "provider": "openai"},
    )
    assert res.status_code == 400
    assert "does not support video" in res.get_json()["error"]["message"]

    res_404 = client.post("/api/v1/videos/warp", json={"prompt": "x", "provider": "xai"})
    assert res_404.status_code == 404


def test_pxpipe_skips_when_not_configured():
    result = compress_with_pxpipe({"messages": [{"role": "user", "content": "x" * 30000}]})
    assert result["body"] is None
    assert result["summary"]["reason"] == "pxpipe_not_configured"


def test_pxpipe_skips_below_min_chars(pg_db, monkeypatch):
    monkeypatch.setenv("PXPIPE_URL", "https://pxpipe.internal")
    result = compress_with_pxpipe({"messages": [{"role": "user", "content": "tiny"}]})
    assert result["summary"]["reason"] == "below_min_chars"


def test_pxpipe_transforms_and_reports_savings(pg_db, monkeypatch):
    monkeypatch.setenv("PXPIPE_URL", "https://pxpipe.internal")
    big_body = {"messages": [{"role": "user", "content": "a" * 30000}]}
    smaller = {"messages": [{"role": "user", "content": "a" * 5000}], "png": True}

    class FakePxpipeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, *_args):
            return json.dumps({"body": smaller}).encode()

        def close(self):
            pass

    import urllib.request
    monkeypatch.setattr(urllib.request, "urlopen", lambda req, timeout=None: FakePxpipeResponse())

    result = compress_with_pxpipe(big_body)
    assert result["body"] == smaller
    assert result["summary"]["applied"] is True
    assert result["summary"]["est_tokens_after"] < result["summary"]["est_tokens_before"]


def test_pxpipe_fails_open_on_error(pg_db, monkeypatch):
    monkeypatch.setenv("PXPIPE_URL", "https://pxpipe.internal")

    import urllib.request

    def boom(*args, **kwargs):
        raise OSError("pxpipe down")

    monkeypatch.setattr(urllib.request, "urlopen", boom)
    result = compress_with_pxpipe({"messages": [{"role": "user", "content": "x" * 30000}]})
    assert result["body"] is None
    assert result["summary"]["reason"] == "pxpipe_error"


def test_compress_endpoint_pxpipe_path(pg_db, client, monkeypatch):
    monkeypatch.setenv("PXPIPE_URL", "https://pxpipe.internal")
    big = json.dumps({"messages": [{"role": "user", "content": "a" * 30000}]})

    class FakePxpipeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, *_args):
            return json.dumps({"body": {"messages": [{"role": "user", "content": "png"}]}}).encode()

        def close(self):
            pass

    import urllib.request
    monkeypatch.setattr(urllib.request, "urlopen", lambda req, timeout=None: FakePxpipeResponse())

    res = client.post(
        "/api/v1/compress",
        data=big,
        content_type="application/json",
        headers={"X-9Router-Format": "claude"},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["mode"] == "pxpipe"
    assert body["summary"]["applied"] is True


def test_compress_endpoint_pxpipe_below_threshold_passthrough(pg_db, client, monkeypatch):
    monkeypatch.setenv("PXPIPE_URL", "https://pxpipe.internal")
    res = client.post(
        "/api/v1/compress",
        json={"messages": [{"role": "user", "content": "tiny"}]},
        headers={"X-9Router-Format": "claude"},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["mode"] == "passthrough"
    assert body["summary"]["reason"] == "below_min_chars"
