"""Tests for Cross-cutting Reliability, Security & Observability Fase 6 Batch 8.

UC456: Strict CORS Origin Whitelisting.
"""
from __future__ import annotations

import json
from pathlib import Path
import pytest

from auth import middleware


def test_cors_origin_whitelisting(monkeypatch):
    """UC456: Valid and invalid origin verification."""
    # 1. Default whitelisted origins
    assert middleware.is_allowed_cors_origin("http://localhost:5173") is True
    assert middleware.is_allowed_cors_origin("http://localhost:8080") is True

    # 2. Rogue / evil origin
    assert middleware.is_allowed_cors_origin("https://evil-hacker.com") is False
    assert middleware.is_allowed_cors_origin("http://localhost:9999") is False

    # 3. Custom whitelist via env
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://console.radas.io,https://app.radas.io")
    assert middleware.is_allowed_cors_origin("https://console.radas.io") is True
    assert middleware.is_allowed_cors_origin("https://app.radas.io") is True
    assert middleware.is_allowed_cors_origin("https://malicious.com") is False


def test_schema_validator_utility():
    """UC457: Schema validator utility testing type and field constraints."""
    from utils.schema_validator import validate_payload_schema

    schema = {
        "required": ["name", "provider"],
        "properties": {
            "name": {"type": "string", "min_length": 3, "max_length": 50},
            "provider": {"type": "string", "enum": ["aws", "gcp", "hetzner"]},
            "count": {"type": "integer", "min": 1, "max": 100},
            "tags": {"type": "list"},
            "enabled": {"type": "boolean"},
        }
    }

    # 1. Valid payload
    valid_payload = {"name": "prod-stack", "provider": "aws", "count": 5, "tags": ["prod"], "enabled": True}
    ok, err = validate_payload_schema(valid_payload, schema)
    assert ok is True
    assert err is None

    # 2. Missing required
    missing_payload = {"name": "prod-stack"}
    ok, err = validate_payload_schema(missing_payload, schema)
    assert ok is False
    assert "Missing required field: 'provider'" in err

    # 3. Enum mismatch
    bad_enum = {"name": "prod-stack", "provider": "azure"}
    ok, err = validate_payload_schema(bad_enum, schema)
    assert ok is False
    assert "Field 'provider' must be one of" in err

    # 4. Length error
    short_name = {"name": "ab", "provider": "aws"}
    ok, err = validate_payload_schema(short_name, schema)
    assert ok is False
    assert "length must be >= 3" in err


def test_validate_schema_decorator_endpoint():
    """UC457: Flask endpoint with @validate_schema decorator."""
    import flask
    from auth.middleware import validate_schema

    app = flask.Flask(__name__)

    @app.route("/test-schema", methods=["POST"])
    @validate_schema({
        "required": ["key", "value"],
        "properties": {
            "key": {"type": "string"},
            "value": {"type": "integer", "min": 10},
        }
    })
    def sample_validated():
        return flask.jsonify({"ok": True}), 200

    client = app.test_client()

    # Invalid request (value < 10)
    resp_invalid = client.post("/test-schema", json={"key": "test", "value": 5})
    assert resp_invalid.status_code == 400
    assert "Schema validation failed" in resp_invalid.get_json()["error"]

    # Valid request
    resp_valid = client.post("/test-schema", json={"key": "test", "value": 15})
    assert resp_valid.status_code == 200
    assert resp_valid.get_json()["ok"] is True


def test_trace_context_propagation():
    """UC463: Distributed trace context initialization and response header propagation."""
    import flask
    from utils.trace_ctx import init_trace_context, get_current_trace_id
    from auth.middleware import with_trace_context

    app = flask.Flask(__name__)

    @app.route("/trace-test", methods=["GET"])
    @with_trace_context
    def sample_trace():
        current_tid = get_current_trace_id()
        return flask.jsonify({"trace_id": current_tid}), 200

    client = app.test_client()

    # 1. Custom incoming X-Trace-Id
    resp_custom = client.get("/trace-test", headers={"X-Trace-Id": "custom-trace-999"})
    assert resp_custom.status_code == 200
    assert resp_custom.headers.get("X-Trace-Id") == "custom-trace-999"
    assert resp_custom.get_json()["trace_id"] == "custom-trace-999"

    # 2. Auto-generated trace ID
    resp_auto = client.get("/trace-test")
    assert resp_auto.status_code == 200
    auto_tid = resp_auto.headers.get("X-Trace-Id")
    assert auto_tid.startswith("trc-")
    assert resp_auto.get_json()["trace_id"] == auto_tid


def test_prometheus_metrics_generation():
    """UC464: Generate prometheus metrics formatted string."""
    from services.metrics_exporter import generate_prometheus_metrics

    metrics = generate_prometheus_metrics()
    assert "radas_server_up 1" in metrics
    assert "radas_provisioning_stacks_total" in metrics
    assert "radas_byoc_connected_accounts_total" in metrics
    assert "radas_feature_flags_total" in metrics


def test_api_metrics_endpoint():
    """UC464: GET /api/metrics endpoint."""
    import flask
    from api.metrics_routes import bp

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    resp = client.get("/api/metrics")
    assert resp.status_code == 200
    assert "text/plain" in resp.content_type
    assert "radas_server_up 1" in resp.get_data(as_text=True)


def test_test_completion_webhook_dispatch(monkeypatch):
    """UC476: Test suite completion dispatches outbound webhooks."""
    from services import test_cases

    dispatched = []

    def mock_dispatch_event(event_name, payload):
        dispatched.append({"event": event_name, "payload": payload})

    monkeypatch.setattr("services.webhook_dispatcher.dispatch_event", mock_dispatch_event)

    results = [
        {"test_id": "t1", "status": "passed"},
        {"test_id": "t2", "status": "failed"},
    ]

    test_cases.dispatch_test_completion_webhook(
        project_id="proj-101",
        stack="app-stack",
        results=results,
        passed=False,
        duration_ms=450,
    )

    assert len(dispatched) == 2
    events = [d["event"] for d in dispatched]
    assert "test.completed" in events
    assert "test.suite_finished" in events

    p = dispatched[0]["payload"]
    assert p["project_id"] == "proj-101"
    assert p["stack"] == "app-stack"
    assert p["status"] == "failed"
    assert p["total_tests"] == 2
    assert p["passed_tests"] == 1
    assert p["failed_tests"] == 1
    assert p["duration_ms"] == 450


def test_execution_timeout_policy():
    """UC481: Configurable execution timeout policy and deadline evaluation."""
    import time
    from services import cloud_provisioning

    proj = "proj-timeout"
    stk = "large-cluster"

    # Default timeout for apply is 1800s
    assert cloud_provisioning.get_execution_timeout(proj, stk, "apply") == 1800

    # Custom timeout: 300s for plan
    res = cloud_provisioning.set_execution_timeout(proj, stk, action="plan", timeout_seconds=300)
    assert res["timeout_seconds"] == 300
    assert cloud_provisioning.get_execution_timeout(proj, stk, "plan") == 300

    # Deadline evaluation
    now = time.time()
    # Started 10s ago, timeout 100s -> not timed out
    assert cloud_provisioning.check_execution_timed_out(now - 10, timeout_seconds=100) is False
    # Started 150s ago, timeout 100s -> timed out!
    assert cloud_provisioning.check_execution_timed_out(now - 150, timeout_seconds=100) is True


def test_api_execution_timeout_endpoints(data_dir):
    """UC481: GET & POST /api/cloud-provisioning/stacks/<stack>/timeout."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from services.cloud_provisioning import bp
    from storage import pg

    org_id = "org-timeout"
    proj_id = "proj-timeout-api"
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "Timeout Org", 1000))
    pg.execute("INSERT INTO projects (id, name, org_id, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (proj_id, "Timeout Proj", org_id, 1000))
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "u1", "admin", 1000))

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access", org_id=org_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Project-Id": proj_id,
    }

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp, url_prefix="/api/cloud-provisioning")
    client = app.test_client()

    # 1. Set timeout
    resp_set = client.post(
        "/api/cloud-provisioning/stacks/worker-stack/timeout",
        json={"action": "apply", "timeout_seconds": 900},
        headers=headers,
    )
    assert resp_set.status_code == 200
    assert resp_set.get_json()["timeout_seconds"] == 900

    # 2. Get timeouts
    resp_get = client.get("/api/cloud-provisioning/stacks/worker-stack/timeout", headers=headers)
    assert resp_get.status_code == 200
    assert resp_get.get_json()["timeouts"]["apply"] == 900
