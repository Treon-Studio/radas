"""Organization & membership service (Fase 7 — D1).

Multi-tenant model: orgs -> org_members(user, role) -> projects.org_id.
Roles per membership: owner / admin / member / readonly.
"""
from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List, Optional

from storage import pg

ORG_ROLES = ("owner", "admin", "member", "readonly")


def create_org(name: str, creator_user_id: str) -> Dict[str, Any]:
    name = (name or "").strip()
    if not name:
        raise ValueError("org name required")
    org_id = str(uuid.uuid4())
    now = time.time()
    with pg.transaction() as conn:
        conn.execute("INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s,%s,%s,%s)",
                     (org_id, name, creator_user_id, now))
        conn.execute(
            "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s,%s,%s,%s) "
            "ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role",
            (org_id, creator_user_id, "owner", now))
    return {"id": org_id, "name": name, "role": "owner"}


def list_orgs_for_user(user_id: str) -> List[Dict[str, Any]]:
    rows = pg.query_all(
        "SELECT o.id, o.name, m.role FROM orgs o "
        "JOIN org_members m ON m.org_id = o.id "
        "WHERE m.user_id = %s ORDER BY o.name", (user_id,))
    return [{"id": r["id"], "name": r["name"], "role": r["role"]} for r in rows]


def get_org(org_id: str) -> Optional[Dict[str, Any]]:
    row = pg.query_one("SELECT id, name, created_by, created_at FROM orgs WHERE id = %s", (org_id,))
    return dict(row) if row else None


def member_role(org_id: str, user_id: str) -> Optional[str]:
    row = pg.query_one(
        "SELECT role FROM org_members WHERE org_id = %s AND user_id = %s",
        (org_id, user_id))
    return row["role"] if row else None


def is_member(org_id: str, user_id: str) -> bool:
    return member_role(org_id, user_id) is not None


def list_members(org_id: str) -> List[Dict[str, Any]]:
    rows = pg.query_all(
        "SELECT m.user_id, m.role, m.created_at, u.username, u.email "
        "FROM org_members m LEFT JOIN users u ON u.id = m.user_id "
        "WHERE m.org_id = %s ORDER BY m.created_at", (org_id,))
    return [{
        "user_id": r["user_id"], "role": r["role"],
        "username": r.get("username"), "email": r.get("email"),
        "created_at": r.get("created_at"),
    } for r in rows]


def add_member(org_id: str, user_id: str, role: str = "member") -> Dict[str, Any]:
    if role not in ORG_ROLES:
        raise ValueError(f"role must be one of {ORG_ROLES}")
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s,%s,%s,%s) "
        "ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role",
        (org_id, user_id, role, time.time()))
    return {"org_id": org_id, "user_id": user_id, "role": role}


def set_member_role(org_id: str, user_id: str, role: str) -> bool:
    if role not in ORG_ROLES:
        raise ValueError(f"role must be one of {ORG_ROLES}")
    cur = pg.execute(
        "UPDATE org_members SET role = %s WHERE org_id = %s AND user_id = %s",
        (role, org_id, user_id))
    row = pg.query_one(
        "SELECT 1 AS x FROM org_members WHERE org_id = %s AND user_id = %s",
        (org_id, user_id))
    return row is not None


def remove_member(org_id: str, user_id: str) -> bool:
    row = pg.query_one(
        "SELECT 1 AS x FROM org_members WHERE org_id = %s AND user_id = %s",
        (org_id, user_id))
    if not row:
        return False
    pg.execute("DELETE FROM org_members WHERE org_id = %s AND user_id = %s",
               (org_id, user_id))
    return True


def org_projects(org_id: str) -> List[Dict[str, Any]]:
    rows = pg.query_all(
        "SELECT id, name, description, owner_id, is_archived, created_at, updated_at "
        "FROM projects WHERE org_id = %s ORDER BY name", (org_id,))
    return [dict(r) for r in rows]


def accessible_project_ids(user_id: str) -> List[str]:
    """Project ids the user may access, across every org they belong to.

    Drives tenant scoping for search/queue endpoints that otherwise fall back
    to "all projects" when no project context is supplied.
    """
    rows = pg.query_all(
        "SELECT p.id FROM org_members m "
        "JOIN projects p ON p.org_id = m.org_id "
        "WHERE m.user_id = %s ORDER BY p.id", (user_id,))
    return [r["id"] for r in rows]
