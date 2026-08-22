"""Tests for Competitor Parity & Reliability Advanced Fase 6 Batch 7.

UC360: Audit Log Export (JSONL / CSV) for SIEM.
"""
from __future__ import annotations

import json
from pathlib import Path
import pytest

from services import audit_events


def test_export_audit_logs_jsonl_and_csv(data_dir, monkeypatch):
    """UC360: Export system audit events for SIEM."""
    fake_entries = [
        {"id": "ev-1", "action": "cloud.apply.started", "actor_user_id": "u1", "created_at": "2026-08-20T10:00:00Z", "target_type": "stack", "target_id": "stk-1", "meta": {"env": "prod"}},
        {"id": "ev-2", "action": "cloud.apply.completed", "actor_user_id": "u1", "created_at": "2026-08-20T10:05:00Z", "target_type": "stack", "target_id": "stk-1", "meta": {"status": "ok"}},
        {"id": "ev-3", "action": "byoc.account.created", "actor_user_id": "u2", "created_at": "2026-08-21T12:00:00Z", "target_type": "account", "target_id": "acc-1", "meta": {}},
    ]
    monkeypatch.setattr("storage.auth_db.list_audit", lambda *args, **kwargs: fake_entries)

    # 1. Export JSONL
    jsonl_out = audit_events.export_audit_logs(output_format="jsonl")
    lines = [json.loads(l) for l in jsonl_out.strip().split("\n")]
    assert len(lines) == 3
    assert lines[0]["action"] == "cloud.apply.started"
    assert lines[2]["actor_user_id"] == "u2"

    # 2. Export with filter
    filtered_out = audit_events.export_audit_logs(output_format="jsonl", action_filter="byoc")
    f_lines = [json.loads(l) for l in filtered_out.strip().split("\n")]
    assert len(f_lines) == 1
    assert f_lines[0]["action"] == "byoc.account.created"

    # 3. Export CSV
    csv_out = audit_events.export_audit_logs(output_format="csv")
    assert "id,actor_user_id,action" in csv_out
    assert "ev-1,u1,cloud.apply.started" in csv_out


def test_api_export_audit_logs_endpoint(data_dir, monkeypatch):
    """UC360: GET /api/audit/export endpoint."""
    import flask
    from auth.service import generate_token
    from api.audit_log_routes import bp
    from storage import pg

    org_id = "org-siem"
    proj_id = "proj-siem-1"
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "SIEM Org", 1000))
    pg.execute("INSERT INTO projects (id, name, org_id, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (proj_id, "SIEM Proj", org_id, 1000))
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "u1", "admin", 1000))

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access", org_id=org_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Project-Id": proj_id,
    }

    monkeypatch.setattr(
        "services.audit_events.export_audit_logs",
        lambda **kwargs: '{"id": "ev-99", "action": "test.action"}\n'
    )

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    resp = client.get("/api/audit/export?format=jsonl", headers=headers)
    assert resp.status_code == 200
    assert "application/x-ndjson" in resp.content_type
    assert '{"id": "ev-99"' in resp.get_data(as_text=True)


def test_multi_step_approval_chain(data_dir):
    """UC362: Multi-step approval workflow chain."""
    from services import approval_service

    proj = "proj-chain"
    stk = "prod-k8s"

    # Create 3-step chain
    chain = approval_service.create_approval_chain(
        stk, proj, "apply", steps=["tech-lead", "security", "devops-admin"], requested_by="developer1"
    )
    assert chain["is_chain"] is True
    assert chain["status"] == "pending"
    assert chain["current_step"] == "tech-lead"
    assert chain["current_step_index"] == 0

    # Step 1 approval
    s1 = approval_service.approve_chain_step(chain["id"], step_name="tech-lead", approver="lead_bob")
    assert s1["status"] == "pending"
    assert s1["current_step"] == "security"
    assert s1["current_step_index"] == 1

    # Step 2 approval
    s2 = approval_service.approve_chain_step(chain["id"], step_name="security", approver="sec_alice")
    assert s2["status"] == "pending"
    assert s2["current_step"] == "devops-admin"
    assert s2["current_step_index"] == 2

    # Step 3 approval -> full approval!
    s3 = approval_service.approve_chain_step(chain["id"], step_name="devops-admin", approver="admin_charlie")
    assert s3["status"] == "approved"
    assert s3["current_step"] is None


def test_api_approval_chain_endpoints(data_dir):
    """UC362: POST /api/approvals/chain and POST /api/approvals/<id>/step."""
    import flask
    from auth.service import generate_token
    from api.approval_routes import bp
    from storage import pg

    org_id = "org-appr"
    proj_id = "proj-appr-api"
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "Appr Org", 1000))
    pg.execute("INSERT INTO projects (id, name, org_id, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (proj_id, "Appr Proj", org_id, 1000))
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "u1", "admin", 1000))

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access", org_id=org_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Project-Id": proj_id,
    }

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    # 1. Create chain
    resp_create = client.post(
        "/api/approvals/chain",
        json={"stack": "db-cluster", "project_id": proj_id, "action": "apply", "steps": ["lead", "ops"]},
        headers=headers,
    )
    assert resp_create.status_code == 201
    chain_id = resp_create.get_json()["approval"]["id"]

    # 2. Approve step 1
    resp_step1 = client.post(
        f"/api/approvals/{chain_id}/step",
        json={"step": "lead"},
        headers=headers,
    )
    assert resp_step1.status_code == 200
    assert resp_step1.get_json()["approval"]["current_step"] == "ops"


def test_idempotency_service_and_caching(data_dir):
    """UC405: Idempotency key lookup, storage, and caching."""
    from services import idempotency

    key = "idem-key-12345"
    scope = "proj-1"

    # 1. First check -> empty
    assert idempotency.check_idempotency_key(key, scope=scope) is None

    # 2. Save result
    saved = idempotency.save_idempotency_result(
        key, scope=scope, status_code=201, response_body={"created": True, "id": "res-99"}
    )
    assert saved["key"] == key
    assert saved["status_code"] == 201

    # 3. Second check -> cached hit
    cached = idempotency.check_idempotency_key(key, scope=scope)
    assert cached is not None
    assert cached["status_code"] == 201
    assert cached["response_body"]["id"] == "res-99"


def test_idempotency_middleware_decorator():
    """UC405: Idempotency middleware deduplicates POST requests with same Idempotency-Key."""
    import flask
    from auth.middleware import idempotent_mutation

    app = flask.Flask(__name__)
    call_count = 0

    @app.route("/test-mutation", methods=["POST"])
    @idempotent_mutation()
    def sample_mutation():
        nonlocal call_count
        call_count += 1
        return flask.jsonify({"call_count": call_count, "status": "executed"}), 201

    client = app.test_client()

    # Request 1 with Idempotency-Key
    resp1 = client.post("/test-mutation", headers={"Idempotency-Key": "req-idem-1"}, json={"amount": 100})
    assert resp1.status_code == 201
    assert resp1.get_json()["call_count"] == 1
    assert call_count == 1

    # Request 2 with same Idempotency-Key -> should return cached response without incrementing call_count
    resp2 = client.post("/test-mutation", headers={"Idempotency-Key": "req-idem-1"}, json={"amount": 100})
    assert resp2.status_code == 201
    assert resp2.get_json()["call_count"] == 1
    assert call_count == 1


def test_circuit_breaker_stack_apply(data_dir):
    """UC409: Circuit breaker trips after threshold failures and resets."""
    from services import cloud_provisioning

    proj = "proj-cb"
    stk = "fragile-stack"

    # Initial state -> closed
    assert cloud_provisioning.is_circuit_open(proj, stk) is False

    # 1st failure -> closed
    r1 = cloud_provisioning.record_apply_result(proj, stk, success=False, failure_threshold=3)
    assert r1["is_open"] is False
    assert r1["circuit_breaker"]["consecutive_failures"] == 1

    # 2nd failure -> closed
    r2 = cloud_provisioning.record_apply_result(proj, stk, success=False, failure_threshold=3)
    assert r2["is_open"] is False
    assert r2["circuit_breaker"]["consecutive_failures"] == 2

    # 3rd failure -> TRIPPED (open)
    r3 = cloud_provisioning.record_apply_result(proj, stk, success=False, failure_threshold=3)
    assert r3["is_open"] is True
    assert r3["circuit_breaker"]["state"] == "open"
    assert cloud_provisioning.is_circuit_open(proj, stk) is True

    # Manual reset
    reset_res = cloud_provisioning.reset_circuit_breaker(proj, stk)
    assert reset_res["is_open"] is False
    assert cloud_provisioning.is_circuit_open(proj, stk) is False


def test_api_circuit_breaker_endpoints(data_dir):
    """UC409: GET and POST /api/cloud-provisioning/stacks/<stack>/circuit-breaker."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from services.cloud_provisioning import bp
    from storage import pg

    org_id = "org-cb"
    proj_id = "proj-cb-api"
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "CB Org", 1000))
    pg.execute("INSERT INTO projects (id, name, org_id, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (proj_id, "CB Proj", org_id, 1000))
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "u1", "admin", 1000))

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access", org_id=org_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Project-Id": proj_id,
    }

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp, url_prefix="/api/cloud-provisioning")
    client = app.test_client()

    # 1. GET circuit breaker
    resp_get = client.get("/api/cloud-provisioning/stacks/app-stack/circuit-breaker", headers=headers)
    assert resp_get.status_code == 200
    assert resp_get.get_json()["circuit_breaker"]["state"] == "closed"

    # 2. Reset circuit breaker
    resp_reset = client.post("/api/cloud-provisioning/stacks/app-stack/circuit-breaker/reset", headers=headers)
    assert resp_reset.status_code == 200
    assert resp_reset.get_json()["is_open"] is False


def test_secret_scanner_plan_output():
    """UC420: Secret scanning and automatic masking in plan output."""
    from services import cloud_provisioning

    dirty_plan = """
    # OpenTofu Plan
    + resource "aws_instance" "web" {
        + ami           = "ami-123456"
        + instance_type = "t3.micro"
        + user_data     = "export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\\nexport GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz\\npassword = \\"superSecretPassword123\\""
    }
    """

    res = cloud_provisioning.scan_and_mask_secrets(dirty_plan)
    assert res["clean"] is False
    assert res["findings_count"] >= 3
    assert "[REDACTED_AWS_KEY]" in res["masked_text"]
    assert "[REDACTED_GITHUB_TOKEN]" in res["masked_text"]
    assert "[REDACTED_SECRET]" in res["masked_text"]
    assert "AKIAIOSFODNN7EXAMPLE" not in res["masked_text"]
    assert "ghp_1234567890" not in res["masked_text"]
    assert "superSecretPassword123" not in res["masked_text"]



def test_api_scan_plan_endpoint():
    """UC420: POST /api/cloud-provisioning/scan-plan."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from services.cloud_provisioning import bp

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp, url_prefix="/api/cloud-provisioning")
    client = app.test_client()

    resp = client.post(
        "/api/cloud-provisioning/scan-plan",
        json={"text": "database_password = \"mySecretP@ssw0rd\""},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["clean"] is False
    assert data["findings_count"] >= 1
    assert "[REDACTED_SECRET]" in data["masked_text"]
