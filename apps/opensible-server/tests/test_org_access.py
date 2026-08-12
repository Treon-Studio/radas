"""Unit tests for org-scoped project access (Fase 7 — D2).

Uses real JWT + test_client so the require_project_access -> require_auth
stack resolves like production.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql://localhost/radas_test")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-at-least-32-chars-long!!")
os.environ.setdefault("INTERNAL_CALL_SECRET", "test-internal-call-secret-at-least-32-chars")

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
    for uid, name in [("u1", "alice"), ("u2", "bob")]:
        p.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)",
                  (uid, name, "x"))
    from services.org_service import create_org
    org_a = create_org("OrgA", "u1")
    org_b = create_org("OrgB", "u2")
    p.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s)",
        ("proj-a", org_a["id"], "u1", "ProjA", "", "now"))
    return org_a, org_b


def _token(uid: str, username: str) -> str:
    from auth.service import generate_token
    return generate_token(uid, username, ["admin"], Path("/tmp"), token_type="access")


def _client():
    import flask
    from auth import middleware as mw
    app = flask.Flask(__name__)
    app.config["TESTING"] = True

    @app.route("/x")
    @mw.require_project_access
    def view():
        return ("ok", 200)

    return app.test_client()


def test_project_org_bound(pg_db):
    _seed()
    from auth.middleware import _org_id_of_project
    assert _org_id_of_project("proj-a") is not None


def test_member_of_org_can_access(pg_db):
    org_a, _ = _seed()
    from services.org_service import is_member
    assert is_member(org_a["id"], "u1") is True


def test_cross_org_denied(pg_db):
    org_a, org_b = _seed()
    from services.org_service import is_member
    assert is_member(org_a["id"], "u2") is False
    assert is_member(org_b["id"], "u1") is False


def test_project_access_allows_member_denies_outsider(pg_db):
    _seed()
    client = _client()
    # u1 (member of OrgA) -> 200
    r = client.get("/x", headers={
        "X-Project-Id": "proj-a",
        "Authorization": f"Bearer {_token('u1', 'alice')}",
    })
    assert r.status_code == 200, r.data
    # u2 (not member of OrgA) -> 403
    r = client.get("/x", headers={
        "X-Project-Id": "proj-a",
        "Authorization": f"Bearer {_token('u2', 'bob')}",
    })
    assert r.status_code == 403, r.data
