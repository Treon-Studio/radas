"""Unit tests for org/membership service (Fase 7 — D1)."""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/radas_test")

import pytest

from storage import pg, pg_schema


@pytest.fixture(autouse=True)
def pg_db():
    pg.reset_connection_pool()
    pg_schema.reset_schema()
    yield
    pg.reset_connection_pool()


def _seed_users():
    from storage import pg as p
    for uid, name in [("u1", "alice"), ("u2", "bob")]:
        p.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)",
                  (uid, name, "x"))


def test_create_org_sets_creator_owner(pg_db):
    _seed_users()
    from services.org_service import create_org, list_orgs_for_user, member_role
    org = create_org("Acme", "u1")
    assert org["role"] == "owner"
    assert list_orgs_for_user("u1")[0]["name"] == "Acme"
    assert member_role(org["id"], "u1") == "owner"


def test_add_and_remove_member(pg_db):
    _seed_users()
    from services.org_service import add_member, create_org, is_member, remove_member, list_members
    org = create_org("Acme", "u1")
    add_member(org["id"], "u2", "member")
    assert is_member(org["id"], "u2") is True
    assert len(list_members(org["id"])) == 2
    assert remove_member(org["id"], "u2") is True
    assert is_member(org["id"], "u2") is False


def test_set_member_role(pg_db):
    _seed_users()
    from services.org_service import create_org, set_member_role, member_role
    org = create_org("Acme", "u1")
    add_member_ = __import__("services.org_service", fromlist=["add_member"]).add_member
    add_member_(org["id"], "u2", "member")
    assert set_member_role(org["id"], "u2", "admin") is True
    assert member_role(org["id"], "u2") == "admin"


def test_org_not_member_isolation(pg_db):
    _seed_users()
    from services.org_service import create_org, is_member
    org_a = create_org("A", "u1")
    org_b = create_org("B", "u2")
    assert is_member(org_a["id"], "u2") is False
    assert is_member(org_b["id"], "u1") is False


def test_invalid_role_rejected(pg_db):
    _seed_users()
    from services.org_service import add_member, create_org
    org = create_org("Acme", "u1")
    try:
        add_member(org["id"], "u2", "superuser")
        assert False, "should raise"
    except ValueError as e:
        assert "role" in str(e)
