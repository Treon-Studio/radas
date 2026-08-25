"""Idempotent first-run tenant and starter-content bootstrap."""
from __future__ import annotations

import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from storage import pg

_DEFAULT_ORG_NAME = "Radas Workspace"
_STARTER_PROJECT_NAME = "Getting Started"
_STARTER_INVENTORY = """all:
  hosts:
    localhost:
      ansible_connection: local
"""
_STARTER_PLAYBOOK = """- name: Radas starter playbook
  hosts: all
  gather_facts: false
  tasks:
    - name: Verify the Ansible connection
      ansible.builtin.debug:
        msg: "Radas starter project is ready"
"""


def _starter_enabled() -> bool:
    """Return whether safe starter files should be written."""
    return os.environ.get("SEED_STARTER_DATA", "true").lower() in {
        "1", "true", "yes", "on"
    }


def _admin_user() -> Optional[Dict[str, Any]]:
    """Return the bootstrap user, preferring the conventional admin account."""
    return pg.query_one(
        "SELECT id, username FROM users WHERE username = %s LIMIT 1", ("admin",)
    ) or pg.query_one(
        "SELECT id, username FROM users ORDER BY created_at ASC, id ASC LIMIT 1"
    )


def _ensure_org(conn: Any, user_id: str) -> Dict[str, Any]:
    """Return an existing user organization or create the default one."""
    existing = conn.execute(
        "SELECT o.id, o.name FROM orgs o "
        "JOIN org_members m ON m.org_id = o.id "
        "WHERE m.user_id = %s ORDER BY o.created_at ASC, o.id ASC LIMIT 1",
        (user_id,),
    ).fetchone()
    if existing:
        return dict(existing)

    org_id = str(uuid.uuid4())
    now = time.time()
    conn.execute(
        "INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s,%s,%s,%s)",
        (org_id, _DEFAULT_ORG_NAME, user_id, now),
    )
    conn.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s,%s,%s,%s)",
        (org_id, user_id, "owner", now),
    )
    return {"id": org_id, "name": _DEFAULT_ORG_NAME}


def _ensure_project(conn: Any, org_id: str, user_id: str) -> Dict[str, Any]:
    """Return or create the safe starter project for an organization."""
    existing = conn.execute(
        "SELECT id, org_id, owner_id, name FROM projects "
        "WHERE org_id = %s AND name = %s LIMIT 1",
        (org_id, _STARTER_PROJECT_NAME),
    ).fetchone()
    if existing:
        return dict(existing)

    project_id = str(uuid.uuid4())
    now = time.time()
    conn.execute(
        "INSERT INTO projects "
        "(id, org_id, owner_id, name, description, is_archived, created_at, updated_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            project_id,
            org_id,
            user_id,
            _STARTER_PROJECT_NAME,
            "A safe local Ansible starter project.",
            0,
            now,
            str(now),
        ),
    )
    return {
        "id": project_id,
        "org_id": org_id,
        "owner_id": user_id,
        "name": _STARTER_PROJECT_NAME,
    }


def _write_starter_files(projects_dir: Path, project_id: str) -> None:
    """Create starter files without overwriting user-managed content."""
    repo_dir = projects_dir / project_id / "repo"
    inventories_dir = repo_dir / "inventories"
    playbooks_dir = repo_dir / "playbooks"
    inventories_dir.mkdir(parents=True, exist_ok=True)
    playbooks_dir.mkdir(parents=True, exist_ok=True)

    inventory_file = inventories_dir / "inventory.yml"
    playbook_file = playbooks_dir / "ping.yml"
    if not inventory_file.exists():
        inventory_file.write_text(_STARTER_INVENTORY, encoding="utf-8")
    if not playbook_file.exists():
        playbook_file.write_text(_STARTER_PLAYBOOK, encoding="utf-8")


def seed_default_tenant(data_dir: Path, projects_dir: Path) -> Optional[Dict[str, Any]]:
    """Ensure the first user has an organization and a safe starter project.

    Existing organizations, projects, and starter files are never overwritten.
    Returns the organization/project record when a bootstrap user exists.
    """
    del data_dir  # Kept in the public signature for startup-service consistency.
    user = _admin_user()
    if not user:
        return None

    with pg.transaction() as conn:
        org = _ensure_org(conn, user["id"])
        project = _ensure_project(conn, org["id"], user["id"])

    if _starter_enabled():
        _write_starter_files(projects_dir, project["id"])

    return {"org": org, "project": project}
