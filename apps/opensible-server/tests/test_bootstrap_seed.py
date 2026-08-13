"""Tests for the idempotent first-run tenant bootstrap."""
from __future__ import annotations

from pathlib import Path

from storage import pg
from services.bootstrap_seed import seed_default_tenant


def _seed_admin() -> str:
    user_id = "admin-seed-user"
    pg.execute(
        "INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)",
        (user_id, "admin", "hash"),
    )
    return user_id


def test_seed_creates_org_project_and_safe_files(pg_db, tmp_path: Path, monkeypatch):
    user_id = _seed_admin()

    result = seed_default_tenant(tmp_path, tmp_path / "projects")

    assert result is not None
    assert result["org"]["name"] == "Radas Workspace"
    assert result["project"]["name"] == "Getting Started"
    assert pg.query_one(
        "SELECT role FROM org_members WHERE org_id = %s AND user_id = %s",
        (result["org"]["id"], user_id),
    )["role"] == "owner"
    project_dir = tmp_path / "projects" / result["project"]["id"] / "repo"
    assert (project_dir / "inventories" / "inventory.yml").exists()
    assert (project_dir / "playbooks" / "ping.yml").exists()


def test_seed_is_idempotent_and_does_not_overwrite_files(pg_db, tmp_path: Path):
    _seed_admin()
    projects_dir = tmp_path / "projects"

    first = seed_default_tenant(tmp_path, projects_dir)
    assert first is not None
    playbook = projects_dir / first["project"]["id"] / "repo" / "playbooks" / "ping.yml"
    playbook.write_text("custom content\n", encoding="utf-8")

    second = seed_default_tenant(tmp_path, projects_dir)

    assert second == first
    assert playbook.read_text(encoding="utf-8") == "custom content\n"
    assert pg.query_one("SELECT COUNT(*) AS count FROM orgs")["count"] == 1
    assert pg.query_one("SELECT COUNT(*) AS count FROM projects")["count"] == 1


def test_seed_can_disable_starter_files(pg_db, tmp_path: Path, monkeypatch):
    _seed_admin()
    monkeypatch.setenv("SEED_STARTER_DATA", "false")

    result = seed_default_tenant(tmp_path, tmp_path / "projects")

    assert result is not None
    project_dir = tmp_path / "projects" / result["project"]["id"] / "repo"
    assert not (project_dir / "inventories" / "inventory.yml").exists()
    assert not (project_dir / "playbooks" / "ping.yml").exists()
