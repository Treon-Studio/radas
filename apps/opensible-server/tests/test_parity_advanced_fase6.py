"""Tests for Competitor Parity & BYOC Extended Fase 6.

UC312: Backup BYOC Config (Encrypted JSON Export & Restore).
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
