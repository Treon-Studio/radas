"""Tests for BYOC & Multi-Cloud Resource Import Advanced Fase 6.

UC273, UC294, UC306, UC307.
"""
from __future__ import annotations

import json
from unittest.mock import patch
import pytest

from services import byoc


def test_byoc_aws_assume_role_validation(data_dir):
    """UC273: AWS AssumeRole validation with valid and invalid role_arn."""
    acct = byoc.create_account({
        "name": "AWS Production AssumeRole",
        "provider": "aws",
        "credentials": {
            "role_arn": "arn:aws:iam::123456789012:role/RadasCloudAdmin",
            "external_id": "ext-secret-123",
            "session_name": "radas-session",
        },
    })
    assert acct["id"] is not None
    assert acct["provider"] == "aws"

    val = byoc.validate_account(acct["id"])
    assert val["ok"] is True
    assert val["status"] == 200
    assert "IAM AssumeRole verified" in val["detail"]
    assert val["auth_type"] == "assume_role"

    # Verify saved account record has status verified
    updated = byoc.get_account(acct["id"])
    assert updated["status"] == "verified"


def test_byoc_aws_assume_role_invalid_arn(data_dir):
    """UC273: AWS AssumeRole validation rejects malformed role_arn."""
    acct = byoc.create_account({
        "name": "AWS Bad Role",
        "provider": "aws",
        "credentials": {
            "role_arn": "invalid-arn-string",
        },
    })
    val = byoc.validate_account(acct["id"])
    assert val["ok"] is False
    assert val["status"] == 400
    assert "invalid role_arn format" in val["detail"]

    updated = byoc.get_account(acct["id"])
    assert updated["status"] == "error"


def test_byoc_gcp_impersonate_validation(data_dir):
    """UC273: GCP Service Account Impersonation validation."""
    acct = byoc.create_account({
        "name": "GCP Staging Impersonate",
        "provider": "gcp",
        "credentials": {
            "service_account_email": "terraform-runner@my-project.iam.gserviceaccount.com",
        },
    })
    val = byoc.validate_account(acct["id"])
    assert val["ok"] is True
    assert val["status"] == 200
    assert "GCP Service Account impersonation verified" in val["detail"]
    assert val["auth_type"] == "gcp_impersonate"

    updated = byoc.get_account(acct["id"])
    assert updated["status"] == "verified"


def test_detect_stack_backend_type(data_dir, tmp_path):
    """UC294: Detect remote (s3/gcs/http/pg) vs local state backend."""
    from services.cloud_provisioning import _stack_dir

    # 1. Local stack (default without backend.hcl)
    sd_local = _stack_dir("proj-backend", "local-stack")
    sd_local.mkdir(parents=True, exist_ok=True)
    (sd_local / "main.tf").write_text('resource "null_resource" "x" {}', encoding="utf-8")
    (sd_local / "terraform.tfstate").write_text('{"version": 4}', encoding="utf-8")

    res_local = byoc.detect_stack_backend_type("proj-backend", "local-stack")
    assert res_local["stack"] == "local-stack"
    assert res_local["backend_type"] == "local"
    assert res_local["is_remote"] is False
    assert res_local["state_file_exists"] is True

    # 2. Remote s3 stack with backend.hcl
    sd_remote = _stack_dir("proj-backend", "s3-stack")
    sd_remote.mkdir(parents=True, exist_ok=True)
    (sd_remote / "backend.hcl").write_text(
        'backend "s3"\nbucket = "my-tofu-states"\nkey = "s3-stack/terraform.tfstate"\nregion = "ap-southeast-1"\n',
        encoding="utf-8",
    )

    res_remote = byoc.detect_stack_backend_type("proj-backend", "s3-stack")
    assert res_remote["stack"] == "s3-stack"
    assert res_remote["backend_type"] == "s3"
    assert res_remote["is_remote"] is True
    assert res_remote["backend_hcl_exists"] is True
    assert res_remote["config"]["bucket"] == "my-tofu-states"
    assert res_remote["config"]["region"] == "ap-southeast-1"


def test_api_stack_backend_type_endpoint(data_dir):
    """UC294: GET /api/byoc/stacks/<stack>/backend-type REST endpoint."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from api.byoc_routes import bp

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Project-Id": "proj-api",
    }

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    resp = client.get("/api/byoc/stacks/my-stack/backend-type", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["stack"] == "my-stack"
    assert "backend_type" in data
    assert "is_remote" in data


def test_export_inventory_csv(data_dir, monkeypatch):
    """UC306: Export multi-account resource inventory to CSV."""
    acct = byoc.create_account({
        "name": "Hetzner Cloud Prod",
        "provider": "hetzner",
        "credentials": {"hcloud_token": "token123"},
        "project_id": "proj-csv",
    })

    fake_inv = {
        "account_id": acct["id"],
        "resources": [
            {"id": "srv-1", "name": "web-1", "type": "server", "region": "fsn1", "status": "running", "address": "hcloud_server.web1"},
            {"id": "vol-1", "name": "data-vol", "type": "volume", "region": "fsn1", "status": "active", "address": "hcloud_volume.data"},
        ],
    }
    monkeypatch.setattr(byoc, "get_inventory", lambda account_id: fake_inv)

    csv_out = byoc.export_inventory_csv(account_id=acct["id"])
    assert "account_id,account_name,provider,resource_id,resource_name,resource_type,region,status,address" in csv_out
    assert "srv-1,web-1,server,fsn1,running,hcloud_server.web1" in csv_out
    assert "vol-1,data-vol,volume,fsn1,active,hcloud_volume.data" in csv_out


def test_api_export_inventory_csv_endpoint(data_dir, monkeypatch):
    """UC306: GET /api/byoc/inventory/export/csv endpoint returns text/csv."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from api.byoc_routes import bp

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access")
    headers = {"Authorization": f"Bearer {token}"}

    monkeypatch.setattr(byoc, "export_inventory_csv", lambda account_id=None, project_id=None: "col1,col2\nval1,val2\n")

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    resp = client.get("/api/byoc/inventory/export/csv", headers=headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.content_type
    assert "attachment; filename=byoc-inventory.csv" in resp.headers.get("Content-Disposition", "")
    assert "col1,col2" in resp.get_data(as_text=True)


def test_adopt_resources_import_only(data_dir, monkeypatch):
    """UC307: Adopt resources in import-only mode without full terraform apply."""
    from services import byoc_import_mapping
    from storage import pg

    # Setup org, project, and stack in pg
    org_id = "org-adopt"
    proj_id = "proj-adopt"
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "Adopt Org", 1000))
    pg.execute("INSERT INTO projects (id, name, org_id, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (proj_id, "Adopt Project", org_id, 1000))
    pg.execute("INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (proj_id, "adopt-stack", json.dumps({"status": "active"})))

    acct = byoc.create_account({
        "name": "Hetzner Adopt",
        "provider": "hetzner",
        "credentials": {"hcloud_token": "token-adopt"},
        "org_id": org_id,
        "project_id": proj_id,
    })

    fake_inv = {
        "account_id": acct["id"],
        "resources": [
            {"id": "vm-adopt-1", "name": "app-server", "type": "hcloud_server", "address": "hcloud_server.app"},
        ],
    }
    monkeypatch.setattr(byoc, "get_inventory", lambda account_id: fake_inv)

    res = byoc_import_mapping.adopt_resources_import_only(
        acct["id"],
        project_id=proj_id,
        stack="adopt-stack",
        resource_ids=["vm-adopt-1"],
        actor_id="__internal__",
    )

    assert res["ok"] is True
    assert res["mode"] == "import_only"
    assert res["adopted_count"] == 1
    assert "import {\n  to = hcloud_server.app" in res["import_block"]

    # Verify managed_resources has the entry marked managed
    managed = byoc.list_managed_resources(acct["id"])
    managed_ids = [m["resource_id"] for m in managed]
    assert "vm-adopt-1" in managed_ids
