"""Tests for Stack Lifecycle, Pinning & Cost Optimization Fase 6 Batch 10.

UC533: Stack Worker Pinning & Execution Placement Policy.
"""
from __future__ import annotations

import flask
import pytest
from services import cloud_provisioning


def test_stack_worker_pinning_logic(data_dir):
    """UC533: Set and retrieve stack worker pinning configuration."""
    proj = "proj-pin"
    stk = "sensitive-db"

    # Initially empty
    default_pin = cloud_provisioning.get_stack_worker_pin(proj, stk)
    assert default_pin["worker_id"] is None
    assert default_pin["required_tags"] == []

    # Pin to worker-dc-1 with region tags
    res = cloud_provisioning.set_stack_worker_pin(
        proj, stk, worker_id="worker-sg-01", tags=["region:ap-southeast-1", "secure-enclave"], strict=True
    )
    assert res["ok"] is True
    assert res["worker_pin"]["worker_id"] == "worker-sg-01"
    assert "secure-enclave" in res["worker_pin"]["required_tags"]

    # Verify retrieval
    pin = cloud_provisioning.get_stack_worker_pin(proj, stk)
    assert pin["worker_id"] == "worker-sg-01"
    assert pin["strict"] is True


def test_api_stack_pin_endpoints(data_dir):
    """UC533: GET & POST /api/cloud-provisioning/stacks/<stack>/pin."""
    from pathlib import Path
    from auth.service import generate_token
    from services.cloud_provisioning import bp
    from storage import pg

    org_id = "org-pin"
    proj_id = "proj-pin-api"
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "Pin Org", 1000))
    pg.execute("INSERT INTO projects (id, name, org_id, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (proj_id, "Pin Proj", org_id, 1000))
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

    # 1. Set pin
    resp_set = client.post(
        "/api/cloud-provisioning/stacks/app-stack/pin",
        json={"worker_id": "worker-02", "tags": ["gpu", "high-mem"], "strict": True},
        headers=headers,
    )
    assert resp_set.status_code == 200
    assert resp_set.get_json()["worker_pin"]["worker_id"] == "worker-02"

    # 2. Get pin
    resp_get = client.get("/api/cloud-provisioning/stacks/app-stack/pin", headers=headers)
    assert resp_get.status_code == 200
    assert resp_get.get_json()["worker_pin"]["worker_id"] == "worker-02"


def test_policy_exemptions_lifecycle(data_dir):
    """UC547: Create policy exemption, check active exemption, and list exemptions."""
    from services import cloud_policy

    proj = "proj-exemption"
    stk = "legacy-app"
    rule = "deny_public_ingress"

    # Initially not exempted
    assert cloud_policy.is_rule_exempted(proj, stk, rule) is False

    # Create exemption
    ex = cloud_policy.create_policy_exemption(
        proj, stk, rule, reason="Legacy migration grace period", requested_by="dev1", approved_by="sec_lead", ttl_seconds=3600
    )
    assert ex["status"] == "active"
    assert ex["rule_id"] == rule

    # Verify is_rule_exempted returns True
    assert cloud_policy.is_rule_exempted(proj, stk, rule) is True
    assert cloud_policy.is_rule_exempted(proj, stk, "other_rule") is False

    # List exemptions
    all_ex = cloud_policy.list_policy_exemptions(proj, stack=stk)
    assert len(all_ex) >= 1
    assert all_ex[0]["rule_id"] == rule


def test_cost_anomaly_detection(data_dir):
    """UC550: Cost anomaly threshold configuration and spike detection."""
    from services import usage_service

    proj = "proj-anomaly"

    # Configure thresholds: spike >= 40%, delta >= $50
    cfg = usage_service.set_cost_anomaly_config(proj, max_percentage_spike=40, max_amount_delta=50.0)
    assert cfg["max_percentage_spike"] == 40
    assert cfg["max_amount_delta"] == 50.0

    # 1. Normal change: $100 -> $120 (20% spike, delta $20) -> Not anomaly
    res_normal = usage_service.detect_cost_anomaly(proj, previous_cost=100.0, current_cost=120.0)
    assert res_normal["is_anomaly"] is False
    assert res_normal["delta_amount"] == 20.0
    assert res_normal["percentage_spike"] == 20.0

    # 2. Abnormal spike: $100 -> $200 (100% spike, delta $100) -> Anomaly!
    res_spike = usage_service.detect_cost_anomaly(proj, previous_cost=100.0, current_cost=200.0)
    assert res_spike["is_anomaly"] is True
    assert len(res_spike["reasons"]) >= 1


def test_cost_usage_csv_export(data_dir):
    """UC560: Export usage data to CSV format."""
    from services import usage_service

    csv_data = usage_service.export_cost_usage_csv(project_id="proj-csv")
    assert "id,org_id,project_id,instance_id,runtime_id,cpu_millicores,memory_mb,storage_gb,running_seconds,observed_at" in csv_data


def test_api_usage_csv_export_endpoint(data_dir):
    """UC560: GET /api/projects/<project_id>/usage/export/csv."""
    from pathlib import Path
    from auth.service import generate_token
    from api.usage_routes import bp
    from storage import pg

    org_id = "org-usage-csv"
    proj_id = "proj-usage-csv-api"
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "CSV Org", 1000))
    pg.execute("INSERT INTO projects (id, name, org_id, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (proj_id, "CSV Proj", org_id, 1000))
    pg.execute("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "u1", "admin", 1000))

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access", org_id=org_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Project-Id": proj_id,
    }

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    resp = client.get(f"/api/projects/{proj_id}/usage/export/csv", headers=headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.content_type
    assert "cpu_millicores,memory_mb" in resp.get_data(as_text=True)
