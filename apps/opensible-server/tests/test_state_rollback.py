"""Tests for Stack Snapshots & State Rollback (UC343 / UC332).

Verifies snapshot creation, listing, arbitrary version rollback, pruning,
and cloud_state version rollback API endpoints.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import flask
import pytest

from services.stack_snapshots import (
    snapshot, list_snapshots, restore, _prune, MAX_SNAPSHOTS
)
from services import cloud_state


def _setup_project(project_id: str = "proj-snap"):
    from storage import pg
    now = time.time()
    org_id = f"org-{project_id}"
    pg.execute(
        "INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s, %s, %s, %s) "
        "ON CONFLICT (id) DO NOTHING",
        (org_id, org_id, "owner", now),
    )
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, created_at, updated_at) "
        "VALUES (%s, %s, %s, %s, %s, 0, %s, %s) ON CONFLICT (id) DO NOTHING",
        (project_id, org_id, "owner", project_id, "", now, now),
    )


def test_snapshot_creates_and_lists_snapshots(pg_db, tmp_path, monkeypatch):
    project_id = "proj-snap-1"
    stack_name = "network"
    _setup_project(project_id)

    stack_dir = tmp_path / "projects" / project_id / "stacks" / stack_name
    stack_dir.mkdir(parents=True, exist_ok=True)
    (stack_dir / "terraform.tfvars").write_text('env = "prod"\n', encoding="utf-8")
    (stack_dir / "terraform.tfstate").write_text('{"version": 4, "serial": 1}\n', encoding="utf-8")

    import services.cloud_provisioning as cp
    monkeypatch.setattr(cp, "_stack_dir", lambda pid, name: stack_dir)

    # 1. Take snapshot
    sid1 = snapshot(project_id, stack_name, reason="test initial")
    assert sid1 is not None

    snaps = list_snapshots(project_id, stack_name)
    assert len(snaps) == 1
    assert snaps[0]["id"] == sid1
    assert snaps[0]["reason"] == "test initial"

    # 2. Modify files and take second snapshot
    time.sleep(0.01)
    (stack_dir / "terraform.tfvars").write_text('env = "staging"\n', encoding="utf-8")
    (stack_dir / "terraform.tfstate").write_text('{"version": 4, "serial": 2}\n', encoding="utf-8")

    sid2 = snapshot(project_id, stack_name, reason="test second")
    assert sid2 is not None
    assert sid2 != sid1

    snaps = list_snapshots(project_id, stack_name)
    assert len(snaps) == 2
    assert snaps[0]["id"] == sid2
    assert snaps[1]["id"] == sid1


def test_restore_arbitrary_snapshot_version(pg_db, tmp_path, monkeypatch):
    project_id = "proj-snap-restore"
    stack_name = "db"
    _setup_project(project_id)

    stack_dir = tmp_path / "projects" / project_id / "stacks" / stack_name
    stack_dir.mkdir(parents=True, exist_ok=True)
    import services.cloud_provisioning as cp
    monkeypatch.setattr(cp, "_stack_dir", lambda pid, name: stack_dir)

    # Snapshot v1
    (stack_dir / "terraform.tfvars").write_text('db_size = "small"\n', encoding="utf-8")
    (stack_dir / "terraform.tfstate").write_text('{"serial": 1, "resources": ["v1"]}\n', encoding="utf-8")
    v1_id = snapshot(project_id, stack_name, reason="v1-small")

    # Snapshot v2
    time.sleep(0.01)
    (stack_dir / "terraform.tfvars").write_text('db_size = "large"\n', encoding="utf-8")
    (stack_dir / "terraform.tfstate").write_text('{"serial": 2, "resources": ["v2"]}\n', encoding="utf-8")
    v2_id = snapshot(project_id, stack_name, reason="v2-large")

    # Current disk is v3 (un-snapshotted)
    (stack_dir / "terraform.tfvars").write_text('db_size = "broken"\n', encoding="utf-8")
    (stack_dir / "terraform.tfstate").write_text('{"serial": 3, "resources": ["corrupted"]}\n', encoding="utf-8")

    # Rollback to v1 explicitly
    restored_id = restore(project_id, stack_name, snapshot_id=v1_id)
    assert restored_id == v1_id
    assert (stack_dir / "terraform.tfvars").read_text(encoding="utf-8") == 'db_size = "small"\n'
    assert json.loads((stack_dir / "terraform.tfstate").read_text(encoding="utf-8"))["resources"] == ["v1"]

    # Rollback to v2 explicitly
    restored_id2 = restore(project_id, stack_name, snapshot_id=v2_id)
    assert restored_id2 == v2_id
    assert (stack_dir / "terraform.tfvars").read_text(encoding="utf-8") == 'db_size = "large"\n'
    assert json.loads((stack_dir / "terraform.tfstate").read_text(encoding="utf-8"))["resources"] == ["v2"]


def test_snapshot_pruning_respects_max_limit(pg_db, tmp_path, monkeypatch):
    project_id = "proj-snap-prune"
    stack_name = "app"
    _setup_project(project_id)

    stack_dir = tmp_path / "projects" / project_id / "stacks" / stack_name
    stack_dir.mkdir(parents=True, exist_ok=True)
    import services.cloud_provisioning as cp
    monkeypatch.setattr(cp, "_stack_dir", lambda pid, name: stack_dir)

    (stack_dir / "terraform.tfvars").write_text("var = 1\n", encoding="utf-8")

    ids = []
    for i in range(MAX_SNAPSHOTS + 3):
        time.sleep(0.01)
        (stack_dir / "terraform.tfvars").write_text(f"var = {i}\n", encoding="utf-8")
        sid = snapshot(project_id, stack_name, reason=f"run-{i}")
        ids.append(sid)

    snaps = list_snapshots(project_id, stack_name)
    assert len(snaps) == MAX_SNAPSHOTS
    # Ensure newest snapshots are preserved and oldest were pruned
    saved_ids = [s["id"] for s in snaps]
    assert saved_ids == list(reversed(ids[-MAX_SNAPSHOTS:]))


def test_cloud_state_snapshot_and_rollback_disk_version(tmp_path):
    sd = tmp_path / "stack"
    dd = tmp_path / "data"
    sd.mkdir()
    dd.mkdir()

    tfstate = sd / "terraform.tfstate"
    # State format standard with instances inside resources
    tfstate.write_text(json.dumps({
        "format_version": "1.0",
        "terraform_version": "1.8.0",
        "serial": 10,
        "resources": [{"type": "aws_s3_bucket", "instances": [{"attributes": {"id": "bucket-1"}}]}]
    }), encoding="utf-8")

    # 1. Snapshot state version
    entry = cloud_state.snapshot_state(sd, dd, actor="alice", reason="initial apply")
    assert entry is not None
    assert entry["serial"] == 10
    assert entry["resource_count"] == 1
    vid1 = entry["id"]

    # 2. Modify state on disk and snapshot again
    tfstate.write_text(json.dumps({
        "format_version": "1.0",
        "terraform_version": "1.8.0",
        "serial": 11,
        "resources": [
            {"type": "aws_s3_bucket", "instances": [{"attributes": {"id": "bucket-1"}}]},
            {"type": "aws_instance", "instances": [{"attributes": {"id": "i-123"}}]}
        ]
    }), encoding="utf-8")
    entry2 = cloud_state.snapshot_state(sd, dd, actor="bob", reason="scale up")
    assert entry2 is not None
    assert entry2["serial"] == 11
    assert entry2["resource_count"] == 2
    vid2 = entry2["id"]

    # 3. Corrupt state on disk
    tfstate.write_text('{"format_version": "1.0", "serial": 999, "resources": []}', encoding="utf-8")

    # 4. Rollback to version 1
    res = cloud_state.rollback_state(sd, dd, vid1, actor="alice")
    assert res["ok"] is True
    assert res["version_id"] == vid1
    assert res["serial"] == 10
    assert res["resource_count"] == 1

    restored_json = json.loads(tfstate.read_text(encoding="utf-8"))
    assert restored_json["serial"] == 10
    assert len(restored_json["resources"]) == 1

    # Verify pre-rollback backup was created
    backup_file = sd / "terraform.tfstate.rollback-backup"
    assert backup_file.exists()
    assert json.loads(backup_file.read_text(encoding="utf-8"))["serial"] == 999
