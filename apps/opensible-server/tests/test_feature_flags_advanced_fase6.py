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


def test_export_flags_structure_and_properties(data_dir):
    org_a, _, _ = _seed(data_dir)
    from services.feature_flag_registry import create_flag, export_flags

    create_flag({"key": "export.flag.one", "rollout_percent": 60, "description": "First export flag", "tags": ["v1"]})
    create_flag({"key": "export.flag.two", "rollout_percent": 100, "enabled": False})

    # Global export
    exported = export_flags(scope_type="global")
    assert exported["scope_type"] == "global"
    assert exported["scope_id"] is None
    assert exported["version"] == "1.0"
    assert isinstance(exported["exported_at"], int)
    assert len(exported["flags"]) >= 2
    keys = [f["key"] for f in exported["flags"]]
    assert "export.flag.one" in keys
    assert "export.flag.two" in keys

    # Scoped export (organization)
    create_flag({"key": "org.export.flag", "rollout_percent": 50}, scope_type="organization", scope_id=org_a["id"], org_id=org_a["id"])
    org_exported = export_flags(scope_type="organization", scope_id=org_a["id"], org_id=org_a["id"])
    assert org_exported["scope_type"] == "organization"
    assert org_exported["scope_id"] == org_a["id"]
    assert len(org_exported["flags"]) == 1
    assert org_exported["flags"][0]["key"] == "org.export.flag"


def test_import_flags_overwrite_false_rejects_duplicates(data_dir):
    from services.feature_flag_registry import create_flag, get_flag, import_flags

    create_flag({"key": "import.existing.flag", "rollout_percent": 25, "description": "Original"})

    # Trying to import with overwrite=False (default) should raise ValueError
    with pytest.raises(ValueError, match=r"(?i)already exists"):
        import_flags([{"key": "import.existing.flag", "rollout_percent": 90, "description": "Updated"}], overwrite=False)

    # State should remain untouched
    current = get_flag("import.existing.flag")
    assert current["rollout_percent"] == 25
    assert current["description"] == "Original"


def test_import_flags_overwrite_true_updates_existing_and_adds_new(data_dir):
    from services.feature_flag_registry import audit, create_flag, get_flag, import_flags

    create_flag({"key": "import.overwrite.flag", "rollout_percent": 20, "description": "Before overwrite"}, actor="admin-init")

    payload = [
        {"key": "import.overwrite.flag", "rollout_percent": 85, "description": "After overwrite", "enabled": False},
        {"key": "import.new.flag", "rollout_percent": 50, "description": "Brand new flag"},
    ]

    result = import_flags(payload, actor="admin-import", actor_name="Importer", overwrite=True)
    assert result["imported_count"] == 1
    assert result["overwritten_count"] == 1
    assert len(result["flags"]) == 2
    assert "batch_id" in result

    # Verify existing flag was overwritten
    updated = get_flag("import.overwrite.flag")
    assert updated["rollout_percent"] == 85
    assert updated["description"] == "After overwrite"
    assert updated["enabled"] is False

    # Verify new flag was created
    new_flag = get_flag("import.new.flag")
    assert new_flag["rollout_percent"] == 50
    assert new_flag["description"] == "Brand new flag"

    # Check audit log diffs for overwritten flag
    entries = audit(key="import.overwrite.flag")
    assert len(entries) == 2
    overwrite_entry = entries[0]
    assert overwrite_entry["operation"] in ("import_overwrite", "update")
    assert overwrite_entry["actor"] == "admin-import"
    assert overwrite_entry["changes"]["rollout_percent"] == {"before": 20, "after": 85}
    assert overwrite_entry["changes"]["description"] == {"before": "Before overwrite", "after": "After overwrite"}
    assert overwrite_entry["changes"]["enabled"] == {"before": True, "after": False}


def test_import_flags_accepts_wrapped_object_or_bare_list(data_dir):
    from services.feature_flag_registry import get_flag, import_flags

    # Bare list
    res_list = import_flags([{"key": "bare.list.import", "rollout_percent": 100}])
    assert res_list["imported_count"] == 1
    assert get_flag("bare.list.import") is not None

    # Wrapped object {"flags": [...], "version": "1.0"}
    res_obj = import_flags({
        "flags": [{"key": "wrapped.obj.import", "rollout_percent": 75}],
        "version": "1.0",
        "exported_at": 1234567890,
    })
    assert res_obj["imported_count"] == 1
    assert get_flag("wrapped.obj.import") is not None


def test_export_and_import_api_endpoints(data_dir):
    org_a, _, tokens = _seed(data_dir)
    client = _app(data_dir).test_client()

    # Create base flag
    resp = client.post(
        "/api/flags",
        json={"key": "api.export.base", "rollout_percent": 30, "description": "For API export"},
        headers=tokens["admin"],
    )
    assert resp.status_code == 201

    # GET /api/flags/export
    exp_resp = client.get("/api/flags/export", headers=tokens["admin"])
    assert exp_resp.status_code == 200
    exp_data = exp_resp.get_json()
    assert "flags" in exp_data
    assert exp_data["version"] == "1.0"
    assert "exported_at" in exp_data
    keys = [f["key"] for f in exp_data["flags"]]
    assert "api.export.base" in keys

    # POST /api/flags/import without overwrite (duplicate key) -> 400
    dup_resp = client.post(
        "/api/flags/import",
        json={"flags": [{"key": "api.export.base", "rollout_percent": 90}]},
        headers=tokens["admin"],
    )
    assert dup_resp.status_code == 400

    # POST /api/flags/import with overwrite=true in body -> 201
    ok_resp = client.post(
        "/api/flags/import",
        json={
            "flags": [
                {"key": "api.export.base", "rollout_percent": 90, "description": "Overwritten via API"},
                {"key": "api.imported.new", "rollout_percent": 45},
            ],
            "overwrite": True,
        },
        headers=tokens["admin"],
    )
    assert ok_resp.status_code == 201
    import_data = ok_resp.get_json()
    assert import_data["success"] is True
    assert import_data["imported_count"] == 1
    assert import_data["overwritten_count"] == 1

    # Verify state via GET
    get_resp = client.get("/api/flags", headers=tokens["admin"])
    flags_by_key = {f["key"]: f for f in get_resp.get_json()["flags"]}
    assert flags_by_key["api.export.base"]["rollout_percent"] == 90
    assert flags_by_key["api.export.base"]["description"] == "Overwritten via API"
    assert flags_by_key["api.imported.new"]["rollout_percent"] == 45

    # POST /api/flags/import with overwrite=true as query param
    query_resp = client.post(
        "/api/flags/import?overwrite=true",
        json={"flags": [{"key": "api.export.base", "rollout_percent": 100}]},
        headers=tokens["admin"],
    )
    assert query_resp.status_code == 201
    assert query_resp.get_json()["overwritten_count"] == 1


def test_should_skip_approval_default_false(data_dir):
    from services.approval_service import should_skip_approval

    assert should_skip_approval("app", "project-a", "apply") is False
    assert should_skip_approval("db", "project-b", "destroy") is False


def test_should_skip_approval_flag_keys(data_dir):
    from services.approval_service import should_skip_approval
    from services.feature_flag_registry import archive_flag, create_flag, delete_flag

    def _cleanup(key):
        archive_flag(key)
        delete_flag(key)

    # 1. approval.skip
    create_flag({"key": "approval.skip", "enabled": True})
    assert should_skip_approval("app", "project-a", "apply") is True
    _cleanup("approval.skip")
    assert should_skip_approval("app", "project-a", "apply") is False

    # 2. approval.apply.skip
    create_flag({"key": "approval.apply.skip", "enabled": True})
    assert should_skip_approval("app", "project-a", "apply") is True
    assert should_skip_approval("app", "project-a", "destroy") is False
    _cleanup("approval.apply.skip")

    # 3. approval.skip.apply
    create_flag({"key": "approval.skip.apply", "enabled": True})
    assert should_skip_approval("app", "project-a", "apply") is True
    assert should_skip_approval("app", "project-a", "destroy") is False
    _cleanup("approval.skip.apply")

    # 4. approval.auto_approve
    create_flag({"key": "approval.auto_approve", "enabled": True})
    assert should_skip_approval("app", "project-a", "apply") is True
    _cleanup("approval.auto_approve")

    # 5. stack.<stack>.skip_approval
    create_flag({"key": "stack.app.skip_approval", "enabled": True})
    assert should_skip_approval("app", "project-a", "apply") is True
    assert should_skip_approval("db", "project-a", "apply") is False
    _cleanup("stack.app.skip_approval")

    # 6. approval.stack.<stack>.skip
    create_flag({"key": "approval.stack.app.skip", "enabled": True})
    assert should_skip_approval("app", "project-a", "apply") is True
    assert should_skip_approval("db", "project-a", "apply") is False
    _cleanup("approval.stack.app.skip")


def test_should_skip_approval_scopes_and_environments(data_dir):
    org_a, org_b, _ = _seed(data_dir)
    from services.approval_service import should_skip_approval
    from services.feature_flag_registry import create_flag

    # Project scope: only project-a skips approval
    create_flag({"key": "approval.skip", "enabled": True}, scope_type="project", scope_id="project-a", org_id=org_a["id"])
    assert should_skip_approval("app", "project-a", "apply") is True
    assert should_skip_approval("app", "project-b", "apply") is False

    # Org scope: applies when org_id is provided
    create_flag({"key": "approval.auto_approve", "enabled": True}, scope_type="organization", scope_id=org_a["id"], org_id=org_a["id"])
    assert should_skip_approval("app", "unscoped-proj", "apply", org_id=org_a["id"]) is True
    assert should_skip_approval("app", "unscoped-proj", "apply", org_id=org_b["id"]) is False

    # Environment scoping on project-b (which has no org-level auto_approve)
    create_flag({
        "key": "approval.destroy.skip",
        "enabled": True,
        "environments": {"dev": True, "prod": False},
    })
    assert should_skip_approval("app", "project-b", "destroy", env="dev") is True
    assert should_skip_approval("app", "project-b", "destroy", env="prod") is False


def test_cloud_provisioning_approval_gate_bypassed_by_flag(monkeypatch, tmp_path, data_dir):
    from services import cloud_provisioning as cloud
    from services.feature_flag_registry import create_flag

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    monkeypatch.setattr(cloud, "_get_project_id", lambda: "project-a")
    monkeypatch.setattr(cloud, "_stack_dir", lambda project_id, name: tmp_path / name)
    (tmp_path / "demo").mkdir()

    # Meta requires approval
    monkeypatch.setattr(cloud, "_load_meta", lambda project_id, name: {"approval_required": True, "env": "dev"})
    enqueued = []
    monkeypatch.setattr(cloud, "_create_execution", lambda *args, **kwargs: enqueued.append(args) or "exec-run-1")
    monkeypatch.setattr("services.cloud_state.read_lock", lambda *args, **kwargs: None)
    monkeypatch.setattr("services.test_cases.latest_failed_blocker", lambda *args, **kwargs: None)

    app.register_blueprint(cloud.bp)

    # 1. Without flag enabled -> returns 409 Approval required
    with app.test_request_context(
        "/api/cloud/stacks/demo/actions",
        method="POST",
        json={"action": "apply"},
        headers={"X-Project-Id": "project-a"},
    ):
        resp = cloud.stacks_action.__wrapped__("demo")
        assert resp[1] == 409
        assert enqueued == []

    # 2. Enable flag approval.skip
    create_flag({"key": "approval.skip", "enabled": True})

    # Now the mutating action should bypass approval gate and succeed (202 / execution enqueued)
    with app.test_request_context(
        "/api/cloud/stacks/demo/actions",
        method="POST",
        json={"action": "apply"},
        headers={"X-Project-Id": "project-a"},
    ):
        resp = cloud.stacks_action.__wrapped__("demo")
        assert resp[1] == 202
        assert len(enqueued) == 1


def test_webhook_dispatched_on_flag_create_and_update(monkeypatch, data_dir):
    from services.feature_flag_registry import create_flag, update_flag
    import services.webhook_dispatcher as webhook_dispatcher

    dispatched = []

    def mock_dispatch(event, payload):
        dispatched.append((event, payload))
        return 1

    monkeypatch.setattr(webhook_dispatcher, "dispatch_event", mock_dispatch)

    # 1. Create flag
    flag = create_flag(
        {"key": "wh.test.flag", "rollout_percent": 80, "description": "Webhook test flag"},
        actor="admin-alice",
        actor_name="Alice",
    )
    assert len(dispatched) == 2
    events = [d[0] for d in dispatched]
    assert "flag.created" in events
    assert "flag.changed" in events

    created_event = next(d for d in dispatched if d[0] == "flag.created")
    assert created_event[1]["operation"] == "create"
    assert created_event[1]["key"] == "wh.test.flag"
    assert created_event[1]["actor"] == "admin-alice"
    assert created_event[1]["actor_name"] == "Alice"
    assert created_event[1]["scope_type"] == "global"
    assert created_event[1]["flag"]["key"] == "wh.test.flag"
    assert isinstance(created_event[1]["timestamp"], int)

    # 2. Update flag
    dispatched.clear()
    update_flag(
        "wh.test.flag",
        {"rollout_percent": 30, "description": "Updated description"},
        actor="admin-bob",
        actor_name="Bob",
    )
    assert len(dispatched) == 2
    events = [d[0] for d in dispatched]
    assert "flag.updated" in events
    assert "flag.changed" in events

    updated_event = next(d for d in dispatched if d[0] == "flag.updated")
    assert updated_event[1]["operation"] == "update"
    assert updated_event[1]["key"] == "wh.test.flag"
    assert updated_event[1]["actor"] == "admin-bob"
    assert updated_event[1]["changes"]["rollout_percent"] == {"before": 80, "after": 30}
    assert updated_event[1]["changes"]["description"] == {"before": "Webhook test flag", "after": "Updated description"}


def test_webhook_dispatched_on_delete_archive_rollback_copy_import(monkeypatch, data_dir):
    from services.feature_flag_registry import (
        archive_flag,
        copy_flag,
        create_flag,
        delete_flag,
        import_flags,
        rollback_flag,
        update_flag,
    )
    import services.webhook_dispatcher as webhook_dispatcher

    dispatched = []

    def mock_dispatch(event, payload):
        dispatched.append((event, payload))
        return 1

    monkeypatch.setattr(webhook_dispatcher, "dispatch_event", mock_dispatch)

    # Setup base flag
    create_flag({"key": "wh.ops.flag", "rollout_percent": 50}, actor="admin1")
    update_flag("wh.ops.flag", {"rollout_percent": 90}, actor="admin2")
    dispatched.clear()

    # Rollback
    rollback_flag("wh.ops.flag", steps=1, actor="admin3", actor_name="Admin Three")
    assert len(dispatched) == 2
    events = [d[0] for d in dispatched]
    assert "flag.rollback" in events
    assert "flag.changed" in events
    rb_payload = next(d[1] for d in dispatched if d[0] == "flag.rollback")
    assert rb_payload["operation"] == "rollback"
    assert rb_payload["key"] == "wh.ops.flag"
    assert rb_payload["actor"] == "admin3"
    dispatched.clear()

    # Copy
    copy_flag("wh.ops.flag", "wh.copied.flag", actor="admin4", actor_name="Admin Four")
    assert len(dispatched) == 2
    events = [d[0] for d in dispatched]
    assert "flag.copied" in events
    assert "flag.changed" in events
    cp_payload = next(d[1] for d in dispatched if d[0] == "flag.copied")
    assert cp_payload["operation"] == "copy"
    assert cp_payload["key"] == "wh.copied.flag"
    assert cp_payload["actor"] == "admin4"
    dispatched.clear()

    # Import
    import_flags([{"key": "wh.imported.flag", "rollout_percent": 25}], actor="admin5")
    assert len(dispatched) == 2
    events = [d[0] for d in dispatched]
    assert "flag.imported" in events
    assert "flag.changed" in events
    imp_payload = next(d[1] for d in dispatched if d[0] == "flag.imported")
    assert imp_payload["operation"] == "import"
    assert imp_payload["actor"] == "admin5"
    dispatched.clear()

    # Archive
    archive_flag("wh.ops.flag", actor="admin6", reason="retiring flag")
    assert len(dispatched) == 2
    events = [d[0] for d in dispatched]
    assert ("flag.updated" in events or "flag.archived" in events)
    assert "flag.changed" in events
    dispatched.clear()

    # Delete
    delete_flag("wh.ops.flag", actor="admin7")
    assert len(dispatched) == 2
    events = [d[0] for d in dispatched]
    assert "flag.deleted" in events
    assert "flag.changed" in events
    del_payload = next(d[1] for d in dispatched if d[0] == "flag.deleted")
    assert del_payload["operation"] == "delete"
    assert del_payload["key"] == "wh.ops.flag"
    assert del_payload["actor"] == "admin7"


def test_webhook_dispatch_error_does_not_break_flag_operations(monkeypatch, data_dir):
    from services.feature_flag_registry import create_flag, get_flag, update_flag
    import services.webhook_dispatcher as webhook_dispatcher

    def buggy_dispatch(event, payload):
        raise RuntimeError("Webhook dispatcher network/storage failure!")

    monkeypatch.setattr(webhook_dispatcher, "dispatch_event", buggy_dispatch)

    # Operations should succeed without raising exceptions
    flag = create_flag({"key": "wh.resilient.flag", "rollout_percent": 100})
    assert flag["key"] == "wh.resilient.flag"

    updated = update_flag("wh.resilient.flag", {"rollout_percent": 50})
    assert updated["rollout_percent"] == 50

    latest = get_flag("wh.resilient.flag")
    assert latest["rollout_percent"] == 50


def test_get_ui_flags_filtering_and_evaluation(data_dir):
    from services.feature_flag_registry import create_flag, get_ui_flags

    # Create various flags: ui.*, console.*, tagged 'ui', and non-ui flags
    create_flag({"key": "ui.module.dashboard", "enabled": True, "rollout_percent": 100})
    create_flag({"key": "console.features.terminal", "enabled": True, "rollout_percent": 100})
    create_flag({"key": "experimental.sidebar", "enabled": True, "tags": ["ui", "beta"]})
    create_flag({"key": "backend.worker.threads", "enabled": True, "tags": ["backend"]})
    create_flag({"key": "ui.show.billing", "enabled": False})

    # Evaluate UI flags
    flags = get_ui_flags()
    assert "ui.module.dashboard" in flags
    assert flags["ui.module.dashboard"] is True
    assert "console.features.terminal" in flags
    assert flags["console.features.terminal"] is True
    assert "experimental.sidebar" in flags
    assert flags["experimental.sidebar"] is True
    assert "ui.show.billing" in flags
    assert flags["ui.show.billing"] is False
    assert "backend.worker.threads" not in flags


def test_get_ui_flags_targeting_and_scoping(data_dir):
    org_a, org_b, _ = _seed(data_dir)
    from services.feature_flag_registry import create_flag, get_ui_flags

    # Global UI flag with environment restriction (enabled in dev, disabled in prod)
    create_flag({
        "key": "ui.debug_panel",
        "enabled": True,
        "environments": {"dev": True, "prod": False},
    })

    # User whitelisted flag
    create_flag({
        "key": "ui.beta_editor",
        "enabled": True,
        "users_whitelist": ["alice"],
        "rollout_percent": 0,
    })

    # Project scoped UI flag
    create_flag(
        {"key": "ui.custom_branding", "enabled": True},
        scope_type="project",
        scope_id="project-a",
        org_id=org_a["id"],
    )

    # In dev env for anonymous user
    flags_dev = get_ui_flags(env="dev")
    assert flags_dev["ui.debug_panel"] is True
    assert flags_dev["ui.beta_editor"] is False

    # In prod env for alice
    flags_prod_alice = get_ui_flags(env="prod", user_id="alice")
    assert flags_prod_alice["ui.debug_panel"] is False
    assert flags_prod_alice["ui.beta_editor"] is True

    # In project-a context vs global context
    flags_proj = get_ui_flags(scope_type="project", scope_id="project-a", org_id=org_a["id"])
    assert flags_proj["ui.custom_branding"] is True

    flags_global = get_ui_flags(scope_type="global")
    assert "ui.custom_branding" not in flags_global


def test_get_ui_flags_api_route(data_dir):
    org_a, _, tokens = _seed(data_dir)
    client = _app(data_dir).test_client()

    from services.feature_flag_registry import create_flag

    create_flag({"key": "ui.navbar.v2", "enabled": True, "rollout_percent": 100})
    create_flag({"key": "console.audit_viewer", "enabled": True, "environments": {"dev": True, "prod": False}})
    create_flag({"key": "backend.queue_size", "enabled": True})

    # GET /api/flags/ui
    resp = client.get("/api/flags/ui", headers=tokens["admin"])
    assert resp.status_code == 200
    data = resp.get_json()
    assert "flags" in data
    assert data["flags"].get("ui.navbar.v2") is True
    assert data["flags"].get("console.audit_viewer") is False  # default env is prod
    assert "backend.queue_size" not in data["flags"]
    assert data["env"] == "prod"
    assert data["scope_type"] == "global"

    # Query with env=dev
    resp_dev = client.get("/api/flags/ui?env=dev", headers=tokens["admin"])
    assert resp_dev.status_code == 200
    data_dev = resp_dev.get_json()
    assert data_dev["flags"].get("console.audit_viewer") is True
    assert data_dev["env"] == "dev"

    # Query with project scoping
    create_flag(
        {"key": "ui.project_banner", "enabled": True},
        scope_type="project",
        scope_id="project-a",
        org_id=org_a["id"],
    )
    resp_proj = client.get("/api/flags/ui?project_id=project-a", headers=tokens["owner"])
    assert resp_proj.status_code == 200
    data_proj = resp_proj.get_json()
    assert data_proj["flags"].get("ui.project_banner") is True
    assert data_proj["flags"].get("ui.navbar.v2") is True
    assert data_proj["scope_type"] == "project"
    assert data_proj["scope_id"] == "project-a"





