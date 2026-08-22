"""Advanced Feature Flags tests (Phase 6).

Covers UC126 Snapshot Rollback for Feature Flags.
"""
from __future__ import annotations

import time
import flask
import pytest


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

    for user_id, username in (
        ("owner", "owner"),
        ("member", "member"),
        ("outsider", "outsider"),
        ("global-admin", "admin"),
    ):
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


def test_rollback_flag_steps_1(data_dir):
    from services.feature_flag_registry import audit, create_flag, get_flag, rollback_flag, update_flag

    flag = create_flag({"key": "test.rollback.single", "rollout_percent": 100, "enabled": True}, actor="admin1")
    assert flag["rollout_percent"] == 100
    assert flag["enabled"] is True

    update_flag("test.rollback.single", {"rollout_percent": 30, "enabled": False}, actor="admin2")
    current = get_flag("test.rollback.single")
    assert current["rollout_percent"] == 30
    assert current["enabled"] is False

    restored = rollback_flag("test.rollback.single", steps=1, actor="admin3")
    assert restored["rollout_percent"] == 100
    assert restored["enabled"] is True

    # Check that current state is restored
    latest = get_flag("test.rollback.single")
    assert latest["rollout_percent"] == 100
    assert latest["enabled"] is True

    # Audit history check
    entries = audit(key="test.rollback.single")
    assert len(entries) == 3
    assert entries[0]["operation"] == "rollback"
    assert entries[0]["actor"] == "admin3"
    assert entries[0]["changes"]["rollout_percent"] == {"before": 30, "after": 100}
    assert entries[0]["changes"]["enabled"] == {"before": False, "after": True}


def test_rollback_flag_multiple_steps(data_dir):
    from services.feature_flag_registry import create_flag, get_flag, rollback_flag, update_flag

    create_flag({"key": "test.rollback.multi", "rollout_percent": 10, "description": "v1"})
    update_flag("test.rollback.multi", {"rollout_percent": 50, "description": "v2"})
    update_flag("test.rollback.multi", {"rollout_percent": 90, "description": "v3"})

    current = get_flag("test.rollback.multi")
    assert current["rollout_percent"] == 90
    assert current["description"] == "v3"

    # Rollback 2 steps -> back to v1
    restored = rollback_flag("test.rollback.multi", steps=2)
    assert restored["rollout_percent"] == 10
    assert restored["description"] == "v1"

    latest = get_flag("test.rollback.multi")
    assert latest["rollout_percent"] == 10
    assert latest["description"] == "v1"


def test_rollback_flag_by_snapshot_id(data_dir):
    from services.feature_flag_registry import audit, create_flag, get_flag, rollback_flag, update_flag

    create_flag({"key": "test.rollback.snap", "rollout_percent": 10, "description": "v1"})
    update_flag("test.rollback.snap", {"rollout_percent": 50, "description": "v2"})
    update_flag("test.rollback.snap", {"rollout_percent": 90, "description": "v3"})

    entries = audit(key="test.rollback.snap")
    # entries[0] is v3, entries[1] is v2, entries[2] is v1
    v2_entry = entries[1]
    v2_snapshot_id = v2_entry["id"]

    restored = rollback_flag("test.rollback.snap", snapshot_id=v2_snapshot_id)
    assert restored["rollout_percent"] == 50
    assert restored["description"] == "v2"

    latest = get_flag("test.rollback.snap")
    assert latest["rollout_percent"] == 50
    assert latest["description"] == "v2"


def test_rollback_flag_errors(data_dir):
    from services.feature_flag_registry import create_flag, rollback_flag, update_flag

    create_flag({"key": "test.rollback.err", "rollout_percent": 100})

    # No previous version -> raises ValueError
    with pytest.raises(ValueError, match=r"(?i)no previous version"):
        rollback_flag("test.rollback.err", steps=1)

    update_flag("test.rollback.err", {"rollout_percent": 40})

    # Steps too large -> raises ValueError
    with pytest.raises(ValueError, match=r"(?i)cannot rollback|available"):
        rollback_flag("test.rollback.err", steps=5)

    # Invalid steps <= 0 -> raises ValueError
    with pytest.raises(ValueError, match=r"(?i)steps"):
        rollback_flag("test.rollback.err", steps=0)

    # Invalid snapshot_id -> raises ValueError
    with pytest.raises(ValueError, match=r"(?i)snapshot.*not found"):
        rollback_flag("test.rollback.err", snapshot_id="nonexistent-id")

    # Nonexistent flag -> raises ValueError
    with pytest.raises(ValueError, match=r"(?i)not found"):
        rollback_flag("test.nonexistent.flag", steps=1)


def test_rollback_flag_scoped_org_and_project(data_dir):
    org_a, _, _ = _seed(data_dir)
    from services.feature_flag_registry import create_flag, get_flag, rollback_flag, update_flag

    # Project scope
    create_flag({"key": "proj.rollback", "rollout_percent": 20}, scope_type="project", scope_id="project-a", org_id=org_a["id"])
    update_flag("proj.rollback", {"rollout_percent": 80}, scope_type="project", scope_id="project-a", org_id=org_a["id"])

    restored_proj = rollback_flag("proj.rollback", steps=1, scope_type="project", scope_id="project-a", org_id=org_a["id"])
    assert restored_proj["rollout_percent"] == 20
    assert restored_proj["scope_type"] == "project"
    assert restored_proj["scope_id"] == "project-a"

    # Org scope
    create_flag({"key": "org.rollback", "rollout_percent": 15}, scope_type="organization", scope_id=org_a["id"], org_id=org_a["id"])
    update_flag("org.rollback", {"rollout_percent": 75}, scope_type="organization", scope_id=org_a["id"], org_id=org_a["id"])

    restored_org = rollback_flag("org.rollback", steps=1, scope_type="organization", scope_id=org_a["id"], org_id=org_a["id"])
    assert restored_org["rollout_percent"] == 15
    assert restored_org["scope_type"] == "organization"
    assert restored_org["scope_id"] == org_a["id"]


def test_rollback_flag_api_route(data_dir):
    org_a, _, tokens = _seed(data_dir)
    client = _app(data_dir).test_client()

    # Create & update flag via API
    resp1 = client.post("/api/flags", json={"key": "api.rollback.flag", "rollout_percent": 100}, headers=tokens["admin"])
    assert resp1.status_code == 201

    resp2 = client.patch("/api/flags/api.rollback.flag", json={"rollout_percent": 30}, headers=tokens["admin"])
    assert resp2.status_code == 200

    resp3 = client.patch("/api/flags/api.rollback.flag", json={"rollout_percent": 10}, headers=tokens["admin"])
    assert resp3.status_code == 200

    # Rollback 1 step via POST /api/flags/<key>/rollback (default steps=1) -> should be 30%
    rb1 = client.post("/api/flags/api.rollback.flag/rollback", json={}, headers=tokens["admin"])
    assert rb1.status_code == 200
    assert rb1.get_json()["success"] is True
    assert rb1.get_json()["flag"]["rollout_percent"] == 30

    # Rollback with explicit steps=1 from current 30% -> should be 10%
    # (since the state before rollback was 10%)
    rb2 = client.post("/api/flags/api.rollback.flag/rollback", json={"steps": 1}, headers=tokens["admin"])
    assert rb2.status_code == 200
    assert rb2.get_json()["flag"]["rollout_percent"] == 10

    # Test 404 for unknown flag
    rb_err = client.post("/api/flags/unknown.flag/rollback", json={}, headers=tokens["admin"])
    assert rb_err.status_code == 404

    # Test unauthorized (non-admin trying to mutate global flag)
    rb_unauth = client.post("/api/flags/api.rollback.flag/rollback", json={}, headers=tokens["member"])
    assert rb_unauth.status_code == 403


def test_copy_flag_same_scope(data_dir):
    from services.feature_flag_registry import audit, copy_flag, create_flag, get_flag

    source_data = {
        "key": "template.source.flag",
        "name": "Source Template Flag",
        "description": "Original flag for template tests",
        "enabled": True,
        "environments": {"dev": True, "staging": True, "prod": False, "preview": True},
        "rollout_percent": 75,
        "users_whitelist": ["alice", "bob"],
        "users_blacklist": ["charlie"],
        "tags": ["template", "experiment"],
        "kill_switch": False,
        "variants": [{"key": "control", "weight": 40}, {"key": "treatment", "weight": 60}],
        "evaluation_cache_ttl_seconds": 60,
        "ttl_seconds": 3600,
        "scheduled_expire_at": 2000000000,
        "reason": "Created as template",
    }
    src = create_flag(source_data, actor="admin-alice", actor_name="Alice")

    target = copy_flag(
        source_key="template.source.flag",
        target_key="template.cloned.flag",
        actor="admin-bob",
        actor_name="Bob",
    )

    assert target["key"] == "template.cloned.flag"
    assert target["name"] == "Source Template Flag"
    assert target["description"] == "Original flag for template tests"
    assert target["enabled"] is True
    assert target["environments"] == {"dev": True, "staging": True, "prod": False, "preview": True}
    assert target["rollout_percent"] == 75
    assert target["users_whitelist"] == ["alice", "bob"]
    assert target["users_blacklist"] == ["charlie"]
    assert target["tags"] == ["template", "experiment"]
    assert target["variants"] == [{"key": "control", "weight": 40}, {"key": "treatment", "weight": 60}]
    assert target["evaluation_cache_ttl_seconds"] == 60
    assert target["ttl_seconds"] == 3600
    assert target["scheduled_expire_at"] == 2000000000
    assert target["reason"] == "Created as template"

    # ID and timestamps must be fresh, not identical to source
    assert target["id"] != src["id"]
    assert target["owner_id"] == "admin-bob"

    # Verify source remains untouched
    original = get_flag("template.source.flag")
    assert original["id"] == src["id"]
    assert original["key"] == "template.source.flag"

    # Check audit log for copy operation
    entries = audit(key="template.cloned.flag")
    assert len(entries) == 1
    assert entries[0]["operation"] == "copy"
    assert entries[0]["key"] == "template.cloned.flag"
    assert entries[0]["source_key"] == "template.source.flag"
    assert entries[0]["actor"] == "admin-bob"
    assert entries[0]["after"]["key"] == "template.cloned.flag"


def test_copy_flag_across_scopes(data_dir):
    org_a, _, _ = _seed(data_dir)
    from services.feature_flag_registry import copy_flag, create_flag, get_flag

    # Create global template flag
    create_flag(
        {"key": "global.template.auth", "rollout_percent": 50, "description": "Global Auth Template"},
        actor="admin",
    )

    # Copy global -> organization scope
    org_flag = copy_flag(
        source_key="global.template.auth",
        target_key="org.auth.cloned",
        scope_type="global",
        target_scope_type="organization",
        target_scope_id=org_a["id"],
        org_id=org_a["id"],
        actor="org-owner",
    )
    assert org_flag["key"] == "org.auth.cloned"
    assert org_flag["scope_type"] == "organization"
    assert org_flag["scope_id"] == org_a["id"]
    assert org_flag["rollout_percent"] == 50
    assert org_flag["description"] == "Global Auth Template"

    # Ensure not present in global scope
    assert get_flag("org.auth.cloned", scope_type="global") is None
    # Ensure present in org scope
    assert get_flag("org.auth.cloned", scope_type="organization", scope_id=org_a["id"]) is not None

    # Copy organization -> project scope
    proj_flag = copy_flag(
        source_key="org.auth.cloned",
        target_key="project.auth.cloned",
        scope_type="organization",
        scope_id=org_a["id"],
        target_scope_type="project",
        target_scope_id="project-a",
        org_id=org_a["id"],
        actor="project-dev",
    )
    assert proj_flag["key"] == "project.auth.cloned"
    assert proj_flag["scope_type"] == "project"
    assert proj_flag["scope_id"] == "project-a"
    assert proj_flag["rollout_percent"] == 50

    # Ensure present in project scope
    assert get_flag("project.auth.cloned", scope_type="project", scope_id="project-a") is not None


def test_copy_flag_validation_errors(data_dir):
    from services.feature_flag_registry import copy_flag, create_flag

    create_flag({"key": "valid.source.flag", "rollout_percent": 100})

    # Source does not exist
    with pytest.raises(ValueError, match=r"(?i)source.*not found"):
        copy_flag("nonexistent.flag", "valid.target.flag")

    # Target key already exists in same scope
    with pytest.raises(ValueError, match=r"(?i)already exists"):
        copy_flag("valid.source.flag", "valid.source.flag")

    # Invalid target key
    with pytest.raises(ValueError, match=r"(?i)malformed|at least 2 chars|non-empty"):
        copy_flag("valid.source.flag", "INVALID KEY WITH SPACES & CAPS!")

    # Invalid source key
    with pytest.raises(ValueError, match=r"(?i)malformed|at least 2 chars|non-empty|not found"):
        copy_flag("INVALID SOURCE KEY!", "target.key")


def test_copy_flag_api_endpoints(data_dir):
    org_a, _, tokens = _seed(data_dir)
    client = _app(data_dir).test_client()

    # Create source flag via API
    resp = client.post(
        "/api/flags",
        json={"key": "api.template.base", "rollout_percent": 80, "description": "Base template for API copy tests"},
        headers=tokens["admin"],
    )
    assert resp.status_code == 201

    # POST /api/flags/<key>/copy
    copy_resp = client.post(
        "/api/flags/api.template.base/copy",
        json={"target_key": "api.cloned.via.copy"},
        headers=tokens["admin"],
    )
    assert copy_resp.status_code == 201
    copy_data = copy_resp.get_json()
    assert copy_data["success"] is True
    assert copy_data["flag"]["key"] == "api.cloned.via.copy"
    assert copy_data["flag"]["rollout_percent"] == 80

    # POST /api/flags/<key>/clone
    clone_resp = client.post(
        "/api/flags/api.template.base/clone",
        json={"target_key": "api.cloned.via.clone"},
        headers=tokens["admin"],
    )
    assert clone_resp.status_code == 201
    clone_data = clone_resp.get_json()
    assert clone_data["success"] is True
    assert clone_data["flag"]["key"] == "api.cloned.via.clone"

    # POST copy across scopes (global -> project)
    scoped_copy_resp = client.post(
        "/api/flags/api.template.base/copy",
        json={
            "target_key": "api.project.cloned",
            "target_scope_type": "project",
            "target_scope_id": "project-a",
            "target_project_id": "project-a",
        },
        headers=tokens["owner"],
    )
    assert scoped_copy_resp.status_code == 201
    scoped_data = scoped_copy_resp.get_json()
    assert scoped_data["flag"]["key"] == "api.project.cloned"
    assert scoped_data["flag"]["scope_type"] == "project"
    assert scoped_data["flag"]["scope_id"] == "project-a"

    # Error cases:
    # 1. Source not found -> 404
    err_404 = client.post(
        "/api/flags/nonexistent.flag/copy",
        json={"target_key": "any.target"},
        headers=tokens["admin"],
    )
    assert err_404.status_code == 404

    # 2. Target key already exists -> 409
    err_409 = client.post(
        "/api/flags/api.template.base/copy",
        json={"target_key": "api.cloned.via.copy"},
        headers=tokens["admin"],
    )
    assert err_409.status_code == 409

    # 3. Missing target_key -> 400
    err_400 = client.post(
        "/api/flags/api.template.base/copy",
        json={},
        headers=tokens["admin"],
    )
    assert err_400.status_code == 400

    # 4. Unauthorized mutation (member cloning to global scope) -> 403
    err_403 = client.post(
        "/api/flags/api.template.base/copy",
        json={"target_key": "unauthorized.global.flag"},
        headers=tokens["member"],
    )
    assert err_403.status_code == 403

