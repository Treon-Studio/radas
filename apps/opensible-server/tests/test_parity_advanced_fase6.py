"""Tests for Competitor Parity & BYOC Extended Fase 6.

UC312, UC320, UC323.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch
import pytest

from services import byoc


def test_backup_and_restore_accounts_encrypted(data_dir):
    """UC312: Encrypted backup of BYOC accounts and restore functionality."""
    acct1 = byoc.create_account({
        "name": "Backup AWS Account",
        "provider": "aws",
        "credentials": {"role_arn": "arn:aws:iam::123456789012:role/Admin"},
        "project_id": "proj-backup",
    })

    acct2 = byoc.create_account({
        "name": "Backup Hetzner Account",
        "provider": "hetzner",
        "credentials": {"hcloud_token": "secret-token-xyz"},
        "project_id": "proj-backup",
    })

    # 1. Export encrypted backup
    backup = byoc.backup_accounts_encrypted(project_id="proj-backup")
    assert backup["version"] == "1.0"
    assert backup["account_count"] >= 2
    assert "encrypted_payload" in backup
    assert "secret-token-xyz" not in backup["encrypted_payload"]

    # Delete accounts to simulate disaster
    byoc.delete_account(acct1["id"])
    byoc.delete_account(acct2["id"])
    assert byoc.get_account(acct1["id"]) is None
    assert byoc.get_account(acct2["id"]) is None

    # 2. Restore from backup
    restore_res = byoc.restore_accounts_encrypted(backup, project_id="proj-backup")
    assert restore_res["ok"] is True
    assert restore_res["restored_count"] >= 2

    # Verify accounts are back
    restored1 = byoc.get_account(acct1["id"])
    assert restored1 is not None
    assert restored1["name"] == "Backup AWS Account"
    assert restored1["provider"] == "aws"


def test_api_backup_export_and_restore(data_dir):
    """UC312: REST endpoints for encrypted backup and restore."""
    import flask
    from auth.service import generate_token
    from api.byoc_routes import bp

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Project-Id": "proj-api-backup",
    }

    byoc.create_account({
        "name": "API Backup Account",
        "provider": "hetzner",
        "credentials": {"hcloud_token": "tok999"},
        "project_id": "proj-api-backup",
    })

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    # GET /api/byoc/backup/export
    resp_export = client.get("/api/byoc/backup/export", headers=headers)
    assert resp_export.status_code == 200
    backup_data = resp_export.get_json()
    assert "encrypted_payload" in backup_data

    # POST /api/byoc/backup/restore
    resp_restore = client.post("/api/byoc/backup/restore", json=backup_data, headers=headers)
    assert resp_restore.status_code == 200
    assert resp_restore.get_json()["ok"] is True


def test_diff_inventory_unmanaged_resources(data_dir, monkeypatch):
    """UC320: Diff cloud inventory against adopted/managed resources."""
    acct = byoc.create_account({
        "name": "Unmanaged Test Account",
        "provider": "hetzner",
        "credentials": {"hcloud_token": "tok-unmanaged"},
    })

    fake_inv = {
        "account_id": acct["id"],
        "resources": [
            {"id": "vm-managed-1", "name": "app-server", "type": "server"},
            {"id": "vm-unmanaged-2", "name": "rogue-server", "type": "server"},
            {"id": "vol-unmanaged-3", "name": "orphaned-volume", "type": "volume"},
        ],
    }
    monkeypatch.setattr(byoc, "get_inventory", lambda account_id: fake_inv)
    monkeypatch.setattr(byoc, "list_managed_resources", lambda account_id: [{"resource_id": "vm-managed-1"}])

    diff_res = byoc.diff_inventory_unmanaged_resources(acct["id"])
    assert diff_res["total_resources"] == 3
    assert diff_res["managed_count"] == 1
    assert diff_res["unmanaged_count"] == 2
    assert diff_res["coverage_percentage"] == 33.3
    unmanaged_ids = [r["id"] for r in diff_res["unmanaged_resources"]]
    assert "vm-unmanaged-2" in unmanaged_ids
    assert "vol-unmanaged-3" in unmanaged_ids


def test_api_unmanaged_resources_endpoint(data_dir, monkeypatch):
    """UC320: GET /api/byoc/accounts/<account_id>/unmanaged REST endpoint."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from api.byoc_routes import bp

    token = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access")
    headers = {"Authorization": f"Bearer {token}"}

    acct = byoc.create_account({
        "name": "API Unmanaged Account",
        "provider": "hetzner",
        "credentials": {"hcloud_token": "tok999"},
    })

    monkeypatch.setattr(byoc, "diff_inventory_unmanaged_resources", lambda account_id, project_id=None: {
        "account_id": account_id,
        "total_resources": 5,
        "managed_count": 3,
        "unmanaged_count": 2,
        "coverage_percentage": 60.0,
        "unmanaged_resources": [],
        "managed_resources": [],
    })

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    client = app.test_client()

    resp = client.get(f"/api/byoc/accounts/{acct['id']}/unmanaged", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["unmanaged_count"] == 2
    assert data["coverage_percentage"] == 60.0


def test_resource_delete_protection(data_dir):
    """UC323: Resource delete protection configuration and inspection."""
    from services import cloud_provisioning

    proj = "proj-protect"
    stk = "prod-db-stack"

    # Set protected resources
    res = cloud_provisioning.set_resource_protection(
        proj, stk, ["aws_db_instance.main", "aws_ebs_volume.data"]
    )
    assert res["ok"] is True
    assert res["protected_count"] == 2
    assert "aws_db_instance.main" in res["protected_resources"]

    # Get protected resources
    inspect = cloud_provisioning.get_resource_protection(proj, stk)
    assert inspect["protected_count"] == 2
    assert "aws_ebs_volume.data" in inspect["protected_resources"]


def test_api_resource_protection_endpoints(data_dir, monkeypatch):
    """UC323: GET & POST /api/cloud-provisioning/stacks/<stack>/protection."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from services.cloud_provisioning import bp
    from storage import pg

    org_id = "org-prot"
    proj_id = "proj-prot-api"
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "Prot Org", 1000))
    pg.execute("INSERT INTO projects (id, name, org_id, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (proj_id, "Prot Proj", org_id, 1000))
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

    # 1. Set protection
    resp_set = client.post(
        "/api/cloud-provisioning/stacks/app-stack/protection",
        json={"protected_resources": ["hcloud_server.primary"]},
        headers=headers,
    )
    assert resp_set.status_code == 200
    assert resp_set.get_json()["protected_count"] == 1

    # 2. Get protection
    resp_get = client.get(
        "/api/cloud-provisioning/stacks/app-stack/protection",
        headers=headers,
    )
    assert resp_get.status_code == 200
    assert resp_get.get_json()["protected_resources"] == ["hcloud_server.primary"]


def test_execution_comments(data_dir):
    """UC333: Add and list comments on execution runs."""
    from services import cloud_provisioning

    eid = "exec-test-123"
    proj = "proj-comments"

    # Add comment 1
    c1 = cloud_provisioning.add_execution_comment(proj, eid, "Plan looked clean, ready to apply", author="alice")
    assert c1["execution_id"] == eid
    assert c1["author"] == "alice"
    assert c1["comment"] == "Plan looked clean, ready to apply"

    # Add comment 2
    c2 = cloud_provisioning.add_execution_comment(proj, eid, "Approved by security team", author="bob")
    assert c2["author"] == "bob"

    # List comments
    comments = cloud_provisioning.list_execution_comments(proj, eid)
    assert len(comments) == 2
    assert comments[0]["author"] == "alice"
    assert comments[1]["author"] == "bob"


def test_api_execution_comments_endpoints(data_dir):
    """UC333: GET and POST /api/cloud-provisioning/executions/<execution_id>/comments."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from services.cloud_provisioning import bp

    token = generate_token("u1", "charlie", ["admin"], Path("/tmp"), token_type="access")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp, url_prefix="/api/cloud-provisioning")
    client = app.test_client()

    # 1. POST comment
    resp_post = client.post(
        "/api/cloud-provisioning/executions/exec-api-99/comments",
        json={"comment": "Rollback initiated due to timeout"},
        headers=headers,
    )
    assert resp_post.status_code == 201
    assert resp_post.get_json()["comment"] == "Rollback initiated due to timeout"

    # 2. GET comments
    resp_get = client.get(
        "/api/cloud-provisioning/executions/exec-api-99/comments",
        headers=headers,
    )
    assert resp_get.status_code == 200
    data = resp_get.get_json()
    assert data["count"] == 1
    assert data["comments"][0]["comment"] == "Rollback initiated due to timeout"


def test_stack_dependencies_and_dag(data_dir, monkeypatch):
    """UC348: Stack dependencies configuration, graph generation, and cycle detection."""
    from services import cloud_provisioning

    proj = "proj-dag"

    monkeypatch.setattr(cloud_provisioning, "_list_stacks", lambda pid: [
        {"name": "vpc-stack", "provider": "aws", "status": "active"},
        {"name": "db-stack", "provider": "aws", "status": "active"},
        {"name": "app-stack", "provider": "aws", "status": "active"},
    ])

    # 1. db-stack depends on vpc-stack
    res_db = cloud_provisioning.set_stack_dependencies(proj, "db-stack", ["vpc-stack"])
    assert res_db["ok"] is True
    assert res_db["depends_on"] == ["vpc-stack"]

    # 2. app-stack depends on vpc-stack and db-stack
    res_app = cloud_provisioning.set_stack_dependencies(proj, "app-stack", ["vpc-stack", "db-stack"])
    assert res_app["ok"] is True
    assert len(res_app["depends_on"]) == 2

    # 3. Check full graph
    graph_res = cloud_provisioning.get_stack_dependency_graph(proj)
    assert graph_res["total_stacks"] == 3
    assert graph_res["graph"]["app-stack"] == ["db-stack", "vpc-stack"]

    # 4. Circular dependency attempt -> should fail
    # vpc-stack depends on app-stack creates cycle (vpc -> app -> vpc)
    with pytest.raises(ValueError, match="Circular dependency detected"):
        cloud_provisioning.set_stack_dependencies(proj, "vpc-stack", ["app-stack"])


def test_api_dependency_graph_endpoints(data_dir, monkeypatch):
    """UC348: GET & POST /api/cloud-provisioning/dependencies/graph."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from services.cloud_provisioning import bp
    from storage import pg

    org_id = "org-dag"
    proj_id = "proj-dag-api"
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "DAG Org", 1000))
    pg.execute("INSERT INTO projects (id, name, org_id, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (proj_id, "DAG Proj", org_id, 1000))
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

    # 1. Set dependency
    resp_set = client.post(
        "/api/cloud-provisioning/stacks/web-stack/dependencies",
        json={"depends_on": ["base-network"]},
        headers=headers,
    )
    assert resp_set.status_code == 200
    assert resp_set.get_json()["depends_on"] == ["base-network"]

    # 2. Get dependency graph
    resp_graph = client.get(
        "/api/cloud-provisioning/dependencies/graph",
        headers=headers,
    )
    assert resp_graph.status_code == 200
    assert "graph" in resp_graph.get_json()


def test_stack_ttl_and_auto_destroy(data_dir, monkeypatch):
    """UC357: Configure TTL on a stack and detect expired stacks for auto-destroy."""
    from services import cloud_provisioning

    proj = "proj-ttl"
    stk = "ephemeral-preview"

    # Set TTL 3600 seconds
    res_set = cloud_provisioning.set_stack_ttl(proj, stk, ttl_seconds=3600, auto_destroy=True)
    assert res_set["ok"] is True
    assert res_set["ttl_seconds"] == 3600
    assert res_set["auto_destroy"] is True

    # Get TTL status (active)
    status_active = cloud_provisioning.get_stack_ttl(proj, stk)
    assert status_active["ttl_configured"] is True
    assert status_active["is_expired"] is False
    assert status_active["status"] == "active"

    # Mock expired timestamp
    monkeypatch.setattr(cloud_provisioning, "_list_stacks", lambda pid: [{"name": stk}])
    monkeypatch.setattr(cloud_provisioning, "time", type("MockTime", (), {"time": staticmethod(lambda: res_set["expires_at"] + 10)}))

    status_expired = cloud_provisioning.get_stack_ttl(proj, stk)
    assert status_expired["is_expired"] is True
    assert status_expired["status"] == "expired"

    # Check expired stacks list
    expired_list = cloud_provisioning.check_expired_ttl_stacks(proj)
    assert len(expired_list) == 1
    assert expired_list[0]["stack"] == stk
    assert expired_list[0]["action_required"] == "auto_destroy"


def test_api_stack_ttl_endpoints(data_dir, monkeypatch):
    """UC357: GET & POST /api/cloud-provisioning/stacks/<stack>/ttl."""
    from pathlib import Path
    import flask
    from auth.service import generate_token
    from services.cloud_provisioning import bp
    from storage import pg

    org_id = "org-ttl"
    proj_id = "proj-ttl-api"
    pg.execute("INSERT INTO orgs (id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (org_id, "TTL Org", 1000))
    pg.execute("INSERT INTO projects (id, name, org_id, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING", (proj_id, "TTL Proj", org_id, 1000))
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

    # 1. POST TTL
    resp_post = client.post(
        "/api/cloud-provisioning/stacks/preview-pr123/ttl",
        json={"ttl_seconds": 7200, "auto_destroy": True},
        headers=headers,
    )
    assert resp_post.status_code == 200
    assert resp_post.get_json()["ttl_seconds"] == 7200

    # 2. GET TTL
    resp_get = client.get(
        "/api/cloud-provisioning/stacks/preview-pr123/ttl",
        headers=headers,
    )
    assert resp_get.status_code == 200
    assert resp_get.get_json()["ttl_configured"] is True

    # 3. GET Expired list
    resp_exp = client.get(
        "/api/cloud-provisioning/stacks/ttl/expired",
        headers=headers,
    )
    assert resp_exp.status_code == 200
    assert "stacks" in resp_exp.get_json()
