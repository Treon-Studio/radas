from __future__ import annotations

import io
import tarfile
from pathlib import Path

import pytest

from storage import pg
from services import tofu_module_registry


def _seed_org_project() -> tuple[str, str]:
    org_id = "org-module-test"
    project_id = "project-module-test"
    user_id = "user-module-test"
    pg.execute(
        "INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)",
        (user_id, user_id, "x"),
    )
    pg.execute(
        "INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s,%s,%s,%s)",
        (org_id, "Module Org", user_id, 1.0),
    )
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s,%s,%s,%s)",
        (org_id, user_id, "owner", 1.0),
    )
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s)",
        (project_id, org_id, user_id, "Module Project", "", 1.0),
    )
    return org_id, project_id


def _archive(tmp_path: Path, filename: str = "main.tf", body: str = "terraform {}") -> Path:
    path = tmp_path / "module.tar.gz"
    with tarfile.open(path, "w:gz") as archive:
        info = tarfile.TarInfo(filename)
        raw = body.encode()
        info.size = len(raw)
        archive.addfile(info, io.BytesIO(raw))
    return path


def _manifest(version: str = "1.0.0") -> dict:
    return {
        "slug": "internal/vpc/aws",
        "version": version,
        "description": "Internal VPC module",
        "tags": ["network"],
    }


def test_publish_module_persists_immutable_metadata(pg_db, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    org_id, _ = _seed_org_project()
    published = tofu_module_registry.publish_module(_manifest(), _archive(tmp_path), actor_id="user-module-test", org_id=org_id)
    assert published["slug"] == "internal/vpc/aws"
    assert published["version"] == "1.0.0"
    assert published["org_id"] == org_id
    assert published["sha256"]
    assert published["manifest"]["description"] == "Internal VPC module"
    assert "archive_path" not in published
    audit = pg.query_one("SELECT action, actor_user_id, meta_json FROM audit_log WHERE action = %s", ("module.publish",))
    assert audit["actor_user_id"] == "user-module-test"
    assert "internal/vpc/aws" in audit["meta_json"]


def test_publish_module_rejects_duplicate_version_and_preserves_artifact(pg_db, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    org_id, _ = _seed_org_project()
    first = tofu_module_registry.publish_module(_manifest(), _archive(tmp_path, body="terraform {}"), actor_id="user-module-test", org_id=org_id)
    with pytest.raises(tofu_module_registry.ModuleConflictError):
        tofu_module_registry.publish_module(_manifest(), _archive(tmp_path, body="terraform { required_version = \">= 1.0\" }"), actor_id="user-module-test", org_id=org_id)
    current = tofu_module_registry.get_module("internal/vpc/aws", org_id=org_id)
    assert current["sha256"] == first["sha256"]
    assert pg.query_one("SELECT COUNT(*) AS count FROM tofu_module_versions")['count'] == 1


def test_publish_module_rejects_unsafe_or_non_tofu_archives(pg_db, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    org_id, _ = _seed_org_project()
    unsafe = _archive(tmp_path, "../escape.tf")
    with pytest.raises(tofu_module_registry.ModuleValidationError):
        tofu_module_registry.publish_module(_manifest(), unsafe, actor_id="user-module-test", org_id=org_id)
    non_tofu = _archive(tmp_path, "README.md", "docs")
    with pytest.raises(tofu_module_registry.ModuleValidationError):
        tofu_module_registry.publish_module(_manifest("1.0.1"), non_tofu, actor_id="user-module-test", org_id=org_id)


def test_modules_are_organization_scoped(pg_db, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    org_id, _ = _seed_org_project()
    other_org = "org-module-other"
    pg.execute("INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s,%s,%s,%s)", (other_org, "Other", "user-module-test", 1.0))
    tofu_module_registry.publish_module(_manifest(), _archive(tmp_path), actor_id="user-module-test", org_id=org_id)
    assert tofu_module_registry.get_module("internal/vpc/aws", org_id=org_id)
    assert tofu_module_registry.get_module("internal/vpc/aws", org_id=other_org) is None
    assert tofu_module_registry.list_modules(other_org) == []
