from __future__ import annotations

import json
import time
from functools import wraps
from unittest.mock import patch

import pytest
from flask import Flask, jsonify, request
from storage import pg

from services.ai_router import telemetry
from services.ai_router.pricing import estimate_cost

ORG_A = "55555555-5555-5555-5555-555555555555"
ORG_B = "66666666-6666-6666-6666-666666666666"

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
    for org_id, name in ((ORG_A, "Telemetry Org"), (ORG_B, "Isolated Org")):
        pg.execute(
            "INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
            (org_id, name, time.time()),
        )
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (ORG_A, "user-a", "owner", time.time()),
    )

class FakeResponse:
    def __init__(self, payload: bytes):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, *_args):
        return self.payload

    def __iter__(self):
        return iter(self.payload.splitlines(keepends=True))

    def close(self):
        pass


def test_pricing_known_and_unknown_models():
    assert estimate_cost("gpt-4o-mini", 1_000_000, 0) == 0.15
    assert estimate_cost("gpt-4o-mini", 0, 1_000_000) == 0.60
    assert estimate_cost("claude-3-5-sonnet", 500_000, 100_000) == round(0.5 * 3.0 + 0.1 * 15.0, 6)
    assert estimate_cost("totally-custom-model", 10_000_000, 10_000_000) == 0.0


def test_chat_success_records_redacted_log(pg_db, client):
    prompt = "SECRET-CONTENT-should-never-appear-in-logs"
    res = client.post("/api/v1/chat/completions", json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": prompt}]})
    assert res.status_code == 200
    request_id = res.headers.get("X-9Router-Request-ID")
    assert request_id and request_id.startswith("req-")

    logs = client.get(f"/api/orgs/{ORG_A}/ai/logs").get_json()["logs"]
    assert len(logs) == 1
    row = logs[0]
    assert row["status"] == "success"
    assert row["endpoint"] == "chat"
    assert row["resolved_provider"] == "openai"
    assert row["request_id"] == request_id
    assert row["latency_ms"] >= 0
    assert row["cost_usd_est"] > 0  # gpt-4o-mini pricing known
    assert prompt not in json.dumps(row)  # redaction


def test_fallback_attempts_are_logged(pg_db, client, monkeypatch):
    from services.ai_router.gateway import OpenAIGateway, GatewayError
    import api.ai_router_routes as routes

    calls = []

    class FakeResponse:
        def __init__(self, payload, status=200):
            self.payload = payload
            self.status = status

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, *_args):
            return self.payload

    def opener(req, timeout=None):
        calls.append(req.full_url)
        if len(calls) == 1:
            raise _make_http_error(429, "slow down")
        return FakeResponse(b'{"id":"1","choices":[{"message":{"role":"assistant","content":"hi"}}],"usage":{"prompt_tokens":4,"completion_tokens":2}}')

    def _make_http_error(code, message):
        import io
        import urllib.error
        return urllib.error.HTTPError("https://x", code, message, {}, io.BytesIO(b"{}"))

    # gpt-4o chain: openai then (default fallback) anthropic lacks creds -> deepseek etc.
    # Force deterministic two-provider fallback via a route: openai -> deepseek.
    pg.execute(
        "INSERT INTO org_ai_routes (id, org_id, alias_name, primary_model, fallback_models, rtk_compression_enabled, caveman_mode, created_at) "
        "VALUES (%s, %s, %s, %s, %s, TRUE, FALSE, %s)",
        ("route-tel", ORG_A, "tel-alias", json.dumps("gpt-4o-mini"), json.dumps(["deepseek-chat"]), time.time()),
    )
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-tel")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-deepseek-tel")

    class TrackingGateway(OpenAIGateway):
        def _post_json(self, url, payload, headers):
            calls.append(url)
            if len(calls) == 1:
                raise GatewayError("slow down", status=429, retryable=True)
            return {"id": "1", "choices": [{"message": {"role": "assistant", "content": "hi"}}], "usage": {"prompt_tokens": 4, "completion_tokens": 2}}

    original = routes._GATEWAY
    routes._GATEWAY = TrackingGateway()
    try:
        res = client.post("/api/v1/chat/completions", json={"model": "tel-alias", "messages": [{"role": "user", "content": "hi"}]})
    finally:
        routes._GATEWAY = original

    assert res.status_code == 200
    logs = client.get(f"/api/orgs/{ORG_A}/ai/logs").get_json()["logs"]
    row = next(entry for entry in logs if entry["requested_model"] == "tel-alias")
    assert row["fallback_used"] is True
    assert row["resolved_model"] == "deepseek-chat"
    statuses = [a["status"] for a in row["attempts"]]
    assert statuses == ["error", "success"]
    assert row["attempts"][0]["http_status"] == 429


def test_error_request_logged(pg_db, client, monkeypatch):
    from services.ai_router.gateway import GatewayError, OpenAIGateway
    import api.ai_router_routes as routes
    for var in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "DEEPSEEK_API_KEY"):
        monkeypatch.setenv(var, "sk-all-providers-fail")

    class FailingGateway(OpenAIGateway):
        def complete(self, target, payload):
            raise GatewayError("upstream exploded", status=502, retryable=False)

    original = routes._GATEWAY
    routes._GATEWAY = FailingGateway()
    try:
        res = client.post("/api/v1/chat/completions", json={"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]})
    finally:
        routes._GATEWAY = original
    assert res.status_code == 502
    logs = client.get(f"/api/orgs/{ORG_A}/ai/logs?status=error").get_json()["logs"]
    assert any(entry["status"] == "error" and entry["http_status"] == 502 for entry in logs)


def test_logs_date_range_and_limit(pg_db):
    now = time.time()
    for offset in (300, 200, 100):
        telemetry.record_request_log(
            org_id=ORG_A, user_id="user-a", endpoint="chat", requested_model="gpt-4o-mini",
            attempts=[], status="success", request_id=f"req-{offset}",
            resolved_provider="openai", resolved_model="gpt-4o-mini", prompt_tokens=1000,
            completion_tokens=100, created_at=now - offset,
        )
    recent = telemetry.list_request_logs(ORG_A, since=now - 150)
    assert [row["request_id"] for row in recent] == ["req-100"]
    limited = telemetry.list_request_logs(ORG_A, limit=2)
    assert len(limited) == 2
    errors = telemetry.list_request_logs(ORG_A, status="error")
    assert errors == []


def test_costs_aggregation_and_range(pg_db):
    now = time.time()
    telemetry.record_request_log(
        org_id=ORG_A, user_id="user-a", endpoint="chat", requested_model="gpt-4o-mini",
        attempts=[], status="success", request_id="req-c1", resolved_provider="openai",
        resolved_model="gpt-4o-mini", prompt_tokens=1_000_000, completion_tokens=1_000_000,
        created_at=now - 100,
    )
    telemetry.record_request_log(
        org_id=ORG_A, user_id="user-a", endpoint="chat", requested_model="gpt-4o-mini",
        attempts=[], status="error", request_id="req-c2", resolved_provider="openai",
        resolved_model="gpt-4o-mini", created_at=now - 50,
    )
    summary = telemetry.cost_summary(ORG_A)
    assert summary["total_requests"] == 1  # errors excluded
    assert summary["total_cost_usd_est"] == 0.75  # 0.15 + 0.60 per 1M
    assert summary["breakdown"][0]["model"] == "gpt-4o-mini"
    empty = telemetry.cost_summary(ORG_A, since=now + 10)
    assert empty["total_requests"] == 0 and empty["breakdown"] == []


def test_tenant_isolation_for_logs_and_costs(pg_db):
    telemetry.record_request_log(
        org_id=ORG_A, user_id="user-a", endpoint="chat", requested_model="gpt-4o-mini",
        attempts=[], status="success", request_id="req-iso", resolved_provider="openai",
        resolved_model="gpt-4o-mini", prompt_tokens=10, completion_tokens=5,
    )
    client_logs = json.loads(json.dumps(telemetry.list_request_logs(ORG_B)))
    assert client_logs == []
    assert telemetry.cost_summary(ORG_B)["total_requests"] == 0


def test_costs_endpoint_via_http(pg_db, client):
    res = client.get(f"/api/orgs/{ORG_A}/ai/costs")
    assert res.status_code == 200
    body = res.get_json()
    assert body["total_requests"] == 0
    assert "note" in body and "not billing" in body["note"]
