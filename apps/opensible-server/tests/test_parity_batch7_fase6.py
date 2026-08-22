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
