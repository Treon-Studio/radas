"""Authorization and lifecycle contracts for feature-flag HTTP endpoints."""
from __future__ import annotations

import time
from pathlib import Path

import flask


def _app(data_dir):
    from auth import middleware
    from api.feature_flag_routes import bp

    middleware.set_data_dir(data_dir)
    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(bp)
    return app


def _seed(data_dir):
    from auth.service import generate_token
    from services.org_service import add_member, create_org
    from storage import pg

    for user_id, username in (("owner", "owner"), ("member", "member"), ("outsider", "outsider"), ("global-admin", "admin")):
        pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", (user_id, username, "x"))
    org_a = create_org("A", "owner")
    add_member(org_a["id"], "member", "member")
    org_b = create_org("B", "outsider")
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) VALUES (%s,%s,%s,%s,%s,0,%s)",
        ("project-a", org_a["id"], "owner", "A", "", time.time()),
    )

    def token(user_id, username, roles=()):
        return {"Authorization": "Bearer " + generate_token(user_id, username, list(roles), data_dir, token_type="access")}

    return org_a, org_b, {
        "owner": token("owner", "owner"),
        "member": token("member", "member"),
        "outsider": token("outsider", "outsider"),
        "admin": token("global-admin", "admin", ("admin",)),
    }


def test_flag_routes_authorize_project_org_global_and_preview_scopes(data_dir):
    org_a, org_b, tokens = _seed(data_dir)
    client = _app(data_dir).test_client()

    project_headers = {**tokens["member"], "X-Project-Id": "project-a"}
    assert client.post("/api/flags", json={"key": "project.flag"}, headers=project_headers).status_code == 201
    assert client.get("/api/flags", headers={**tokens["outsider"], "X-Project-Id": "project-a"}).status_code == 403
    assert client.get(
        f"/api/flags?project_id=project-a&org_id={org_b['id']}", headers=tokens["member"]
    ).status_code == 400

    assert client.get(f"/api/flags?org_id={org_a['id']}", headers=tokens["member"]).status_code == 200
    assert client.post(f"/api/flags", json={"key": "org.member", "org_id": org_a["id"]}, headers=tokens["member"]).status_code == 403
    assert client.post(f"/api/flags", json={"key": "org.owner", "org_id": org_a["id"]}, headers=tokens["owner"]).status_code == 201
    assert client.post("/api/flags", json={"key": "global.member"}, headers=tokens["member"]).status_code == 403
    assert client.post("/api/flags", json={"key": "global.admin"}, headers=tokens["admin"]).status_code == 201

    assert client.post(
        "/api/flags/evaluate", json={"key": "project.flag", "project_id": "project-a", "user": "someone-else"}, headers=tokens["member"]
    ).status_code == 403
    assert client.post(
        "/api/flags/evaluate", json={"key": "project.flag", "project_id": "project-a", "user": "someone-else"}, headers=tokens["owner"]
    ).status_code == 200


def test_explicit_record_scope_targets_inherited_flags_and_checks_access(data_dir):
    org_a, _org_b, tokens = _seed(data_dir)
    client = _app(data_dir).test_client()

    assert client.post("/api/flags", json={"key": "inherited.flag", "org_id": org_a["id"]}, headers=tokens["owner"]).status_code == 201
    target_scope = {"scope_type": "organization", "scope_id": org_a["id"]}
    project_headers = {**tokens["member"], "X-Project-Id": "project-a"}
    owner_project_headers = {**tokens["owner"], "X-Project-Id": "project-a"}

    listed = client.get("/api/flags", headers=project_headers).get_json()["flags"]
    inherited = next(flag for flag in listed if flag["key"] == "inherited.flag")
    assert inherited["scope_type"] == "organization"
    assert inherited["scope_id"] == org_a["id"]

    updated = client.patch("/api/flags/inherited.flag", json={"enabled": False, **target_scope}, headers=owner_project_headers)
    assert updated.status_code == 200
    assert updated.get_json()["flag"]["scope_type"] == "organization"
    assert client.get(f"/api/flags/inherited.flag/impact?scope_type=organization&scope_id={org_a['id']}", headers=project_headers).status_code == 200
    assert client.get(f"/api/flags/audit?flag_key=inherited.flag&scope_type=organization&scope_id={org_a['id']}", headers=project_headers).status_code == 200
    evaluation = client.post("/api/flags/evaluate", json={"key": "inherited.flag", **target_scope}, headers=project_headers)
    assert evaluation.status_code == 200
    assert evaluation.get_json()["source"] == "organization"

    assert client.patch("/api/flags/inherited.flag", json={"enabled": True, "scope_type": "project", "scope_id": "project-a"}, headers=owner_project_headers).status_code == 404
    assert client.get(f"/api/flags/inherited.flag/impact?scope_type=organization&scope_id={org_a['id']}", headers=tokens["outsider"]).status_code == 403


def test_flag_rollback_returns_conflict_when_target_disappears(data_dir, monkeypatch):
    from api import feature_flag_routes

    _org_a, _org_b, tokens = _seed(data_dir)
    monkeypatch.setattr(feature_flag_routes, "audit", lambda *args, **kwargs: [{"before": {"enabled": False}}])
    monkeypatch.setattr(feature_flag_routes, "update_flag", lambda *args, **kwargs: None)

    response = _app(data_dir).test_client().post("/api/flags/rollback.flag/rollback", headers=tokens["admin"])

    assert response.status_code == 409
    assert response.get_json()["error"] == "not found or conflicted"


def test_flag_routes_lifecycle_impact_atomic_import_and_invalid_limits(data_dir):
    _org_a, _org_b, tokens = _seed(data_dir)
    client = _app(data_dir).test_client()

    assert client.post("/api/flags", json={"key": "parent.flag"}, headers=tokens["admin"]).status_code == 201
    assert client.post("/api/flags", json={"key": "child.flag", "parent_key": "parent.flag"}, headers=tokens["admin"]).status_code == 201
    impact = client.get("/api/flags/parent.flag/impact", headers=tokens["admin"])
    assert impact.status_code == 200
    assert impact.get_json()["dependents"][0]["key"] == "child.flag"
    assert client.post("/api/flags/parent.flag/archive", headers=tokens["admin"]).status_code == 409
    assert client.post("/api/flags/child.flag/archive", headers=tokens["admin"]).status_code == 200
    assert client.delete("/api/flags/child.flag", headers=tokens["admin"]).status_code == 200
    assert client.post("/api/flags/parent.flag/archive", headers=tokens["admin"]).status_code == 200
    assert client.post("/api/flags/parent.flag/restore", headers=tokens["admin"]).get_json()["flag"]["enabled"] is False

    imported = client.post(
        "/api/flags/import", json={"flags": [{"key": "child.import", "parent_key": "parent.import"}, {"key": "parent.import"}]}, headers=tokens["admin"]
    )
    assert imported.status_code == 201
    assert imported.get_json()["imported"] == 2
    rejected = client.post(
        "/api/flags/import", json={"flags": [{"key": "cycle.a", "parent_key": "cycle.b"}, {"key": "cycle.b", "parent_key": "cycle.a"}]}, headers=tokens["admin"]
    )
    assert rejected.status_code == 400
    assert rejected.get_json()["errors"]
    assert client.get("/api/flags/evaluations?limit=not-a-number", headers=tokens["admin"]).status_code == 200
