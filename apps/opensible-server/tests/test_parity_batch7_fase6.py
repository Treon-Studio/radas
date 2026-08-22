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
