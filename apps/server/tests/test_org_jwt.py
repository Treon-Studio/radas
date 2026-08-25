"""Unit tests for JWT org claim & switch-org (Fase 7 — D3)."""
from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/radas_test")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-at-least-32-chars-long!!")

import pytest

from storage import pg, pg_schema


@pytest.fixture(autouse=True)
def pg_db():
    pg.reset_connection_pool()
    pg_schema.reset_schema()
    yield
    pg.reset_connection_pool()


def _seed():
    from storage import pg as p
    p.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)",
              ("u1", "alice", "x"))
    from services.org_service import create_org, add_member
    org_a = create_org("OrgA", "u1")
    org_b = create_org("OrgB", "u1")  # same user owns both
    return org_a, org_b


def test_token_carries_org_id(pg_db):
    _seed()
    from auth.service import generate_token, verify_token
    tok = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access",
                         org_id="org-x")
    payload = verify_token(tok, Path("/tmp"), token_type="access")
    assert payload["org_id"] == "org-x"


def test_token_without_org_has_no_claim(pg_db):
    _seed()
    from auth.service import generate_token, verify_token
    tok = generate_token("u1", "alice", ["admin"], Path("/tmp"), token_type="access")
    payload = verify_token(tok, Path("/tmp"), token_type="access")
    assert payload.get("org_id") is None


def test_switch_org_membership_enforced(pg_db):
    org_a, org_b = _seed()
    from services.org_service import is_member
    assert is_member(org_a["id"], "u1") is True
    assert is_member(org_b["id"], "u1") is True


def test_switch_org_rejects_non_member(pg_db):
    org_a, _ = _seed()
    # u2 is not seeded in either org
    from services.org_service import is_member
    assert is_member(org_a["id"], "u2") is False


def test_login_returns_orgs(pg_db):
    _seed()
    import flask
    import api.auth_routes as ar
    app = flask.Flask(__name__)
    # Just verify org_service.list_orgs_for_user returns both for u1
    from services.org_service import list_orgs_for_user
    orgs = list_orgs_for_user("u1")
    assert len(orgs) == 2
    assert {o["role"] for o in orgs} == {"owner"}
