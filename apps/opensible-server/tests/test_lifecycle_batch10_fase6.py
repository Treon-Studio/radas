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
