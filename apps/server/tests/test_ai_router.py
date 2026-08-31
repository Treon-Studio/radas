"""Tests for 9Router Multi-Provider AI Gateway & Fallback Router (Per-Org)."""
from __future__ import annotations

import json
import pytest
from flask import Flask, request
from unittest.mock import patch
from storage import pg


@pytest.fixture
def app():
    def pass_auth(f):
        return f

    with patch('auth.middleware.require_auth', pass_auth):
        import sys
        if 'api.ai_router_routes' in sys.modules:
            del sys.modules['api.ai_router_routes']
        from api.ai_router_routes import bp as ai_router_bp

        app = Flask(__name__)
        app.register_blueprint(ai_router_bp)

        @app.before_request
        def set_context():
            request.user_id = "test-user-id"
            user = {"user_id": "test-user-id", "username": "tester", "roles": [], "org_id": "e6f5f35d-26bb-4665-a6a3-59c73ef8c6b3"}
            request.user = user
            # Mirror the post-middleware state require_auth normally produces so
            # the real membership/role checks in _org_access are exercised.
            request.current_user = user

        return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_rtk_compression_diff():
    from api.ai_router_routes import _compress_rtk
    large_diff = "diff --git a/main.go b/main.go\n" + "\n".join([f"+ line {i}" for i in range(150)])
    messages = [{"role": "user", "content": large_diff}]

    compressed, saved = _compress_rtk(messages)
    assert saved > 0
    assert "hunk lines truncated (RTK)" in compressed[0]["content"]


def test_rtk_compression_logs():
    from api.ai_router_routes import _compress_rtk
    large_log = "\n".join(["request failed: connection reset by peer" for _ in range(120)])
    messages = [{"role": "user", "content": large_log}]

    compressed, saved = _compress_rtk(messages)
    assert saved > 0
    assert "duplicate lines" in compressed[0]["content"]


def test_ai_router_endpoints(client, pg_db):
    # Seed org row for FK constraint
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", ("e6f5f35d-26bb-4665-a6a3-59c73ef8c6b3", "Test Org", 1700000000.0))
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", ("e6f5f35d-26bb-4665-a6a3-59c73ef8c6b3", "test-user-id", "owner", 1700000000.0))

    # Test models listing
    res = client.get("/api/v1/models")
    assert res.status_code == 200
    data = res.get_json()
    assert "data" in data
    assert any(m["id"] == "gpt-4o-mini" for m in data["data"])

    # Test completions proxy
    payload = {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "Hello 9Router"}]
    }
    res_comp = client.post("/api/v1/chat/completions", json=payload)
    assert res_comp.status_code == 200
    data_comp = res_comp.get_json()
    assert data_comp["object"] == "chat.completion"
    assert "choices" in data_comp
    assert len(data_comp["choices"]) > 0

    # Test Provider Vault endpoints
    prov_payload = {
        "provider_name": "deepseek",
        "api_key": "sk-test-deepseek-key",
        "base_url": "https://api.deepseek.com/v1"
    }
    res_prov = client.post("/api/orgs/e6f5f35d-26bb-4665-a6a3-59c73ef8c6b3/ai/providers", json=prov_payload)
    assert res_prov.status_code == 200

    res_prov_list = client.get("/api/orgs/e6f5f35d-26bb-4665-a6a3-59c73ef8c6b3/ai/providers")
    assert res_prov_list.status_code == 200
    assert any(p["provider_name"] == "deepseek" for p in res_prov_list.get_json()["providers"])

    # Test Model Combo Route rules
    route_payload = {
        "alias_name": "smart-coder",
        "primary_model": "deepseek-coder",
        "fallback_models": ["claude-3-5-sonnet", "gpt-4o-mini"],
        "rtk_compression_enabled": True
    }
    res_route = client.post("/api/orgs/e6f5f35d-26bb-4665-a6a3-59c73ef8c6b3/ai/routes", json=route_payload)
    assert res_route.status_code == 200

    # Test Usage Telemetry
    res_usage = client.get("/api/orgs/e6f5f35d-26bb-4665-a6a3-59c73ef8c6b3/ai/usage")
    assert res_usage.status_code == 200
    assert "summary" in res_usage.get_json()
