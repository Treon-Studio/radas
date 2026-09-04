from __future__ import annotations

import io
import json
import time
from functools import wraps
from unittest.mock import patch

import pytest
from flask import Flask, jsonify, request
from storage import pg

ORG_A = "77777777-7777-7777-7777-777777777777"
ORG_B = "88888888-8888-8888-8888-888888888888"

_HARNESS_USER = {"user_id": "user-a", "username": "tester", "roles": [], "org_id": ORG_A}


def _fake_require_auth(f):
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
    for org_id, name in ((ORG_A, "Media Org"), (ORG_B, "Isolated Org")):
        pg.execute(
            "INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
            (org_id, name, time.time()),
        )
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (ORG_A, "user-a", "owner", time.time()),
    )
    monkeypatch.setenv("OPENAI_API_KEY", "sk-media-test")
    monkeypatch.setenv("GOOGLE_API_KEY", "sk-google-media")


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


def _install_gateway(monkeypatch, recorder: dict):
    from services.ai_router.gateway import OpenAIGateway
    import api.ai_router_routes as routes

    class FakeMediaGateway(OpenAIGateway):
        def images_generate(self, target, payload):
            recorder["images"] = (target.name, target.model, dict(payload))
            return {"created": 1, "data": [{"url": "https://img.test/x.png"}]}

        def responses_create(self, target, payload):
            recorder["responses"] = (target.name, target.model, dict(payload))
            return {
                "id": "resp_1",
                "object": "response",
                "output": [{"type": "message", "content": [{"type": "output_text", "text": "hi"}]}],
                "usage": {"input_tokens": 9, "output_tokens": 3},
            }

    monkeypatch.setattr(routes, "_GATEWAY", FakeMediaGateway())


def test_images_generation_passthrough(pg_db, client, monkeypatch):
    recorder: dict = {}
    _install_gateway(monkeypatch, recorder)

    res = client.post(
        "/api/v1/images/generations",
        json={"model": "dall-e-3", "prompt": "a pixel-art radas mascot", "n": 1, "size": "1024x1024"},
    )
    assert res.status_code == 200
    assert res.get_json()["data"][0]["url"] == "https://img.test/x.png"
    assert recorder["images"][0] == "openai"
    assert recorder["images"][1] == "dall-e-3"
    assert recorder["images"][2]["prompt"] == "a pixel-art radas mascot"
    assert "provider" not in recorder["images"][2]
    assert res.headers["X-9Router-Provider"] == "openai"

    logs = client.get(f"/api/orgs/{ORG_A}/ai/logs").get_json()["logs"]
    assert any(row["endpoint"] == "images" and row["resolved_model"] == "dall-e-3" for row in logs)


def test_images_rejects_provider_without_capability(pg_db, client):
    res = client.post(
        "/api/v1/images/generations",
        json={"model": "dall-e-3", "prompt": "x", "provider": "groq"},
    )
    assert res.status_code == 400
    assert "not supported" in res.get_json()["error"]["message"]

    res_anthropic = client.post(
        "/api/v1/images/generations",
        json={"model": "dall-e-3", "prompt": "x", "provider": "anthropic"},
    )
    assert res_anthropic.status_code == 400


def test_images_requires_prompt(pg_db, client):
    res = client.post("/api/v1/images/generations", json={"model": "dall-e-3"})
    assert res.status_code == 400
    res_long = client.post("/api/v1/images/generations", json={"prompt": "x" * 4001})
    assert res_long.status_code == 400


def test_responses_passthrough(pg_db, client, monkeypatch):
    recorder: dict = {}
    _install_gateway(monkeypatch, recorder)

    res = client.post("/api/v1/responses", json={"model": "gpt-4o-mini", "input": "hello responses api"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["id"] == "resp_1"
    assert recorder["responses"][1] == "gpt-4o-mini"
    assert recorder["responses"][2]["input"] == "hello responses api"
    assert res.headers["X-9Router-Request-ID"].startswith("req-")

    logs = client.get(f"/api/orgs/{ORG_A}/ai/logs").get_json()["logs"]
    row = next(entry for entry in logs if entry["endpoint"] == "responses")
    assert row["prompt_tokens"] == 9
    assert row["completion_tokens"] == 3


def test_responses_requires_input(pg_db, client):
    res_empty = client.post("/api/v1/responses", json={})
    assert res_empty.status_code == 400
    assert "input is required" in res_empty.get_json()["error"]["message"]


def test_media_endpoints_accept_gateway_key(pg_db, client, monkeypatch):
    from services.ai_router import endpoint_keys as epk
    recorder: dict = {}
    _install_gateway(monkeypatch, recorder)
    created = epk.create_key(ORG_A, "media-ci")

    res = client.post(
        "/api/v1/images/generations",
        json={"prompt": "hi", "model": "dall-e-3"},
        headers={"X-Api-Key": created["key"]},
    )
    assert res.status_code == 200

    res_bearer = client.post(
        "/api/v1/responses",
        json={"model": "gpt-4o-mini", "input": "hi"},
        headers={"Authorization": f"Bearer {created['key']}"},
    )
    assert res_bearer.status_code == 200


def test_responses_compact_uses_chat_pipeline(pg_db, client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-compact-test")
    from services.ai_router.gateway import OpenAIGateway
    import api.ai_router_routes as routes

    captured = {}

    class FakeChatGateway(OpenAIGateway):
        def complete(self, target, payload):
            captured["messages"] = payload["messages"]
            captured["model"] = payload["model"]
            return {"choices": [{"message": {"role": "assistant", "content": "compacted summary"}}], "usage": {"prompt_tokens": 12, "completion_tokens": 4}}

    original = routes._GATEWAY
    routes._GATEWAY = FakeChatGateway()
    try:
        res = client.post("/api/v1/responses/compact", json={"model": "gpt-4o-mini", "input": [{"role": "user", "content": "long conversation"}]})
    finally:
        routes._GATEWAY = original
    assert res.status_code == 200
    body = res.get_json()
    assert body["object"] == "response" and body["_compact"] is True
    assert body["output"][0]["content"][0]["text"] == "compacted summary"
    assert body["usage"]["input_tokens"] == 12
    assert captured["messages"][0]["content"] == "long conversation"

    logs = client.get(f"/api/orgs/{ORG_A}/ai/logs").get_json()["logs"]
    assert any(row["endpoint"] == "chat" for row in logs)  # compact runs through chat pipeline


def test_responses_compact_requires_input(pg_db, client):
    res = client.post("/api/v1/responses/compact", json={})
    assert res.status_code == 400


def test_responses_streaming_sse_passthrough(pg_db, client, monkeypatch):
    from services.ai_router.gateway import OpenAIGateway
    import api.ai_router_routes as routes
    monkeypatch.setenv("OPENAI_API_KEY", "sk-stream-test")

    class FakeStreamGateway(OpenAIGateway):
        def responses_stream(self, target, payload):
            self.payload = payload
            assert payload["stream"] is True
            return iter([b'data: {"type":"response.output_text.delta","delta":"Hi"}\n\n', b"data: [DONE]\n\n"])

    original = routes._GATEWAY
    fake = FakeStreamGateway()
    routes._GATEWAY = fake
    try:
        res = client.post("/api/v1/responses", json={"model": "gpt-4o-mini", "input": "hi", "stream": True})
    finally:
        routes._GATEWAY = original
    assert res.status_code == 200
    assert res.mimetype == "text/event-stream"
    body = b"".join(res.response) if hasattr(res, "response") else res.get_data()
    assert b"response.output_text.delta" in body
    assert body.endswith(b"data: [DONE]\n\n")


def test_audio_voices_catalog(pg_db, client):
    res = client.get("/api/v1/audio/voices?provider=openai")
    assert res.status_code == 200
    body = res.get_json()
    assert body["object"] == "list"
    voices = body["data"]
    assert any(v["voice"] == "alloy" for v in voices)
    assert all(v["id"].startswith("tts-1:") for v in voices)
    assert all(v["provider"] == "openai" for v in voices)

    res_groq = client.get("/api/v1/audio/voices?provider=groq&model=playai-tts")
    assert res_groq.status_code == 200
    assert any(v["voice"] == "Arista-PlayAI" and v["model"] == "playai-tts" for v in res_groq.get_json()["data"])


def test_audio_voices_rejects_non_audio_provider(pg_db, client):
    res = client.get("/api/v1/audio/voices?provider=deepseek")
    assert res.status_code == 400
    assert "provider must be one of" in res.get_json()["error"]["message"]


def test_native_gemini_audio_transcribe(pg_db, client, monkeypatch):
    from services.ai_router.gateway import OpenAIGateway
    import api.ai_router_routes as routes

    seen = {}

    class FakeGeminiGateway(OpenAIGateway):
        def _post_json(self, url, payload, headers):
            seen["url"] = url
            seen["payload"] = payload
            seen["headers"] = dict(headers)
            return {"candidates": [{"content": {"parts": [{"text": "hello from gemini stt"}]}}]}

    monkeypatch.setattr(routes, "_GATEWAY", FakeGeminiGateway())

    res = client.post(
        "/api/v1/audio/transcriptions",
        data={"file": (io.BytesIO(b"fake-audio"), "clip.wav", "audio/wav"), "model": "gemini-2.0-flash", "provider": "google"},
        content_type="multipart/form-data",
    )
    assert res.status_code == 200
    assert res.get_json()["text"] == "hello from gemini stt"
    assert seen["url"].endswith(":generateContent")
    inline = seen["payload"]["contents"][0]["parts"][1]["inline_data"]
    assert inline["mime_type"] == "audio/wav"
    assert inline["data"]  # base64 audio present
    assert seen["headers"]["x-goog-api-key"]


def test_native_gemini_audio_speech(pg_db, client, monkeypatch):
    import base64
    from services.ai_router.gateway import OpenAIGateway
    import api.ai_router_routes as routes

    seen = {}
    pcm = b"\x01\x02fake-pcm"

    class FakeGeminiGateway(OpenAIGateway):
        def _post_json(self, url, payload, headers):
            seen["url"] = url
            seen["payload"] = payload
            return {"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "audio/pcm", "data": base64.b64encode(pcm).decode()}}]}}]}

    monkeypatch.setattr(routes, "_GATEWAY", FakeGeminiGateway())

    res = client.post(
        "/api/v1/audio/speech",
        json={"model": "gemini-2.5-flash-preview-tts", "input": "hello", "voice": "Kore", "provider": "google"},
    )
    assert res.status_code == 200
    assert res.data == pcm
    gen = seen["payload"]["generationConfig"]
    assert gen["responseModalities"] == ["AUDIO"]
    assert gen["speechConfig"]["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"] == "Kore"


def test_gemini_voices_catalog(pg_db, client):
    res = client.get("/api/v1/audio/voices?provider=google")
    assert res.status_code == 200
    voices = res.get_json()["data"]
    assert any(v["voice"] == "Kore" for v in voices)


def test_stateful_responses_store_and_chain(pg_db, client, monkeypatch):
    from services.ai_router.gateway import OpenAIGateway
    import api.ai_router_routes as routes
    monkeypatch.setenv("OPENAI_API_KEY", "sk-store-test")
    captured = {}

    class FakeResponsesGateway(OpenAIGateway):
        def responses_create(self, target, payload):
            captured.setdefault("inputs", []).append(payload.get("input"))
            return {
                "id": "resp-upstream", "object": "response",
                "output": [{"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": f"answer {len(captured['inputs'])}"}]}],
                "usage": {"input_tokens": 3, "output_tokens": 2},
            }

    original = routes._GATEWAY
    routes._GATEWAY = FakeResponsesGateway()
    try:
        first = client.post("/api/v1/responses", json={"model": "gpt-4o-mini", "input": "what is radas?", "store": True})
        assert first.status_code == 200
        stored_id = first.headers["X-9Router-Response-ID"]
        assert stored_id.startswith("resp-")

        # follow-up referencing the stored turn: context replayed upstream
        second = client.post("/api/v1/responses", json={"model": "gpt-4o-mini", "input": "and its cli?", "store": True, "previous_response_id": stored_id})
        assert second.status_code == 200
        forwarded = captured["inputs"][-1]
        assert isinstance(forwarded, list) and len(forwarded) == 3
        assert forwarded[0]["role"] == "user" and forwarded[0]["content"] == "what is radas?"
        assert forwarded[1]["role"] == "assistant" and forwarded[1]["content"] == "answer 1"
        assert forwarded[2]["role"] == "user" and forwarded[2]["content"] == "and its cli?"

        # retrieval endpoint
        fetched = client.get(f"/api/v1/responses/{stored_id}")
        assert fetched.status_code == 200
        body = fetched.get_json()
        assert body["output_text"] == "answer 1"
        assert body["previous_response_id"] is None

        # unknown id
        assert client.get("/api/v1/responses/resp-does-not-exist").status_code == 404
    finally:
        routes._GATEWAY = original
