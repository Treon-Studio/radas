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


def test_unknown_project_id_rejected(pg_db):
    """Project id provided but not in DB -> 403 (not silently allowed)."""
    _seed()
    import flask
    from auth import middleware as mw
    app = flask.Flask(__name__)
    app.config["TESTING"] = True

    @app.route("/x")
    @mw.require_project_access
    def view():
        return ("ok", 200)

    client = app.test_client()
    r = client.get("/x", headers={
        "X-Project-Id": "totally-unknown-project",
        "Authorization": f"Bearer {_token('u1', 'alice')}",
    })
    assert r.status_code == 403, r.data
    assert "not found" in r.get_json()["error"].lower()


def test_path_project_param_gated(pg_db):
    """Route dengan <project_id> di path juga di-gate membership."""
    _seed()
    import flask
    from auth import middleware as mw
    app = flask.Flask(__name__)
    app.config["TESTING"] = True

    @app.route("/api/bastion/<project_id>")
    @mw.require_project_access
    def view(project_id):
        return ("ok", 200)

    client = app.test_client()
    # u2 (bukan member org pemilik proj-a) -> 403
    r = client.get("/api/bastion/proj-a", headers={
        "Authorization": f"Bearer {_token('u2', 'bob')}",
    })
    assert r.status_code == 403, r.data
    # u1 (owner) -> 200
    r = client.get("/api/bastion/proj-a", headers={
        "Authorization": f"Bearer {_token('u1', 'alice')}",
    })
    assert r.status_code == 200, r.data


def test_queue_route_requires_project_membership(pg_db):
    """Queue cannot be queried without a project or from another org."""
    _seed()
    import flask
    from api import queue_search_routes

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(queue_search_routes.bp)
    client = app.test_client()

    missing_project = client.get(
        "/api/queue",
        headers={"Authorization": f"Bearer {_token('u1', 'alice')}"},
    )
    assert missing_project.status_code == 400, missing_project.data

    outsider = client.get(
        "/api/queue?project_id=proj-a",
        headers={"Authorization": f"Bearer {_token('u2', 'bob')}"},
    )
    assert outsider.status_code == 403, outsider.data


def test_search_filters_requested_projects_to_memberships(pg_db, monkeypatch):
    """Search never passes projects outside the user's organizations downstream."""
    org_a, org_b = _seed()
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s)",
        ("proj-b", org_b["id"], "u2", "ProjB", "", "now"),
    )

    import flask
    from api import queue_search_routes

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(queue_search_routes.bp)
    seen = {}

    def fake_search(query, entity_types=None, project_ids=None, limit=50):
        seen["project_ids"] = project_ids
        return {"projects": [], "hosts": [], "groups": [], "roles": [],
                "playbooks": [], "variables": [], "executions": [], "drafts": []}

    monkeypatch.setattr(queue_search_routes, "_search_global", fake_search)
    response = app.test_client().post(
        "/api/search",
        json={"query": "needle", "project_ids": ["proj-a", "proj-b"]},
        headers={"Authorization": f"Bearer {_token('u1', 'alice')}"},
    )
    assert response.status_code == 200, response.data
    assert seen["project_ids"] == ["proj-a"]
