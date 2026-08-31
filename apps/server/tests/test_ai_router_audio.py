from __future__ import annotations

import io
import json
import time
from functools import wraps
from unittest.mock import patch

import pytest
from flask import Flask, jsonify, request
from storage import pg

from services.ai_router import endpoint_keys as epk

ORG_A = "33333333-3333-3333-3333-333333333333"
ORG_B = "44444444-4444-4444-4444-444444444444"

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
    for org_id, name in ((ORG_A, "Audio Org"), (ORG_B, "Other Org")):
        pg.execute(
            "INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
            (org_id, name, time.time()),
        )
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (ORG_A, "user-a", "owner", time.time()),
    )
    monkeypatch.setenv("OPENAI_API_KEY", "sk-audio-test")
    monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")


class FakeResponse:
    def __init__(self, payload: bytes, content_type: str = "application/json"):
        self.payload = payload
        self.headers = {"Content-Type": content_type}

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

    class FakeAudioGateway(OpenAIGateway):
        def transcribe(self, target, *, file_bytes, filename, content_type, fields):
            recorder["stt_target"] = (target.name, target.model)
            recorder["stt_file"] = (filename, content_type, file_bytes)
            recorder["stt_fields"] = dict(fields)
            return {"text": "transcribed!"}

        def speak(self, target, payload):
            recorder["tts_target"] = (target.name, target.model)
            recorder["tts_payload"] = dict(payload)
            return b"ID3-audio-bytes", "audio/mpeg"

    monkeypatch.setattr(routes, "_GATEWAY", FakeAudioGateway())


def test_transcription_passthrough(pg_db, client, monkeypatch):
    recorder: dict = {}
    _install_gateway(monkeypatch, recorder)

    res = client.post(
        "/api/v1/audio/transcriptions",
        data={
            "file": (io.BytesIO(b"fake-wav-bytes"), "clip.wav", "audio/wav"),
            "model": "whisper-1",
            "language": "en",
        },
        content_type="multipart/form-data",
    )
    assert res.status_code == 200
    assert res.get_json() == {"text": "transcribed!"}
    assert recorder["stt_target"] == ("openai", "whisper-1")
    assert recorder["stt_file"] == ("clip.wav", "audio/wav", b"fake-wav-bytes")
    assert recorder["stt_fields"]["model"] == "whisper-1"
    assert recorder["stt_fields"]["language"] == "en"


def test_speech_passthrough(pg_db, client, monkeypatch):
    recorder: dict = {}
    _install_gateway(monkeypatch, recorder)

    res = client.post(
        "/api/v1/audio/speech",
        json={"model": "tts-1", "input": "hello gateway", "voice": "alloy"},
    )
    assert res.status_code == 200
    assert res.data == b"ID3-audio-bytes"
    assert res.mimetype == "audio/mpeg"
    assert res.headers["X-9Router-Provider"] == "openai"
    assert recorder["tts_target"] == ("openai", "tts-1")
    assert recorder["tts_payload"]["voice"] == "alloy"


def test_transcription_provider_override_to_groq(pg_db, client, monkeypatch):
    recorder: dict = {}
    _install_gateway(monkeypatch, recorder)

    res = client.post(
        "/api/v1/audio/transcriptions",
        data={
            "file": (io.BytesIO(b"mp3"), "clip.mp3", "audio/mpeg"),
            "model": "whisper-large-v3",
            "provider": "groq",
        },
        content_type="multipart/form-data",
    )
    assert res.status_code == 200
    assert recorder["stt_target"] == ("groq", "whisper-large-v3")


def test_transcription_rejects_unsupported_provider(pg_db, client):
    res = client.post(
        "/api/v1/audio/transcriptions",
        data={"file": (io.BytesIO(b"x"), "clip.mp3", "audio/mpeg"), "model": "claude-3-5-sonnet"},
        content_type="multipart/form-data",
    )
    assert res.status_code == 400
    assert "does not support audio" in res.get_json()["error"]["message"]


def test_speech_rejects_missing_voice_and_empty_input(pg_db, client):
    res_voice = client.post("/api/v1/audio/speech", json={"input": "hello"})
    assert res_voice.status_code == 400
    res_input = client.post("/api/v1/audio/speech", json={"voice": "alloy"})
    assert res_input.status_code == 400
    res_long = client.post("/api/v1/audio/speech", json={"input": "x" * 4097, "voice": "alloy"})
    assert res_long.status_code == 400


def test_transcription_requires_file(pg_db, client):
    res = client.post("/api/v1/audio/transcriptions", data={"model": "whisper-1"}, content_type="multipart/form-data")
    assert res.status_code == 400


def test_audio_endpoints_accept_gateway_key(pg_db, client, monkeypatch):
    recorder: dict = {}
    _install_gateway(monkeypatch, recorder)
    created = epk.create_key(ORG_A, "audio-ci")

    res = client.post(
        "/api/v1/audio/speech",
        json={"model": "tts-1", "input": "hi", "voice": "alloy"},
        headers={"X-Api-Key": created["key"]},
    )
    assert res.status_code == 200

    res_bearer = client.post(
        "/api/v1/audio/transcriptions",
        data={"file": (io.BytesIO(b"a"), "a.wav", "audio/wav")},
        content_type="multipart/form-data",
        headers={"Authorization": f"Bearer {created['key']}"},
    )
    assert res_bearer.status_code == 200


def test_audio_telemetry_recorded(pg_db, client, monkeypatch):
    recorder: dict = {}
    _install_gateway(monkeypatch, recorder)
    res = client.post("/api/v1/audio/speech", json={"model": "tts-1", "input": "hi", "voice": "alloy"})
    assert res.status_code == 200

    usage = client.get(f"/api/orgs/{ORG_A}/ai/usage")
    assert usage.status_code == 200
    records = usage.get_json()["records"]
    assert any(r["model_used"] == "tts-1" and r["provider_used"] == "openai" for r in records)
