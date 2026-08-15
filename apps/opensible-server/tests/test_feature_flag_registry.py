"""Dependency and scope regression coverage for the feature-flag registry."""
from __future__ import annotations

import pytest


def test_parent_and_multiple_prerequisites_gate_evaluation(data_dir):
    from services.feature_flag_registry import create_flag, evaluate

    create_flag({"key": "parent.flag"})
    create_flag({"key": "first.flag"})
    create_flag({"key": "second.flag"})
    child = create_flag({
        "key": "child.flag",
        "parent_key": " Parent.Flag ",
        "prerequisites": [" FIRST.Flag ", "second.flag"],
    })

    assert child["parent_key"] == "parent.flag"
    assert child["prerequisites"] == ["first.flag", "second.flag"]
    assert evaluate("child.flag")["enabled"] is True
    assert evaluate("child.flag")["trace"]

    from services.feature_flag_registry import update_flag
    update_flag("second.flag", {"enabled": False})
    result = evaluate("child.flag")
    assert result["enabled"] is False
    assert result["reason"] == "missing_prerequisite"
    assert result["requires"] == "second.flag"


def test_effective_list_and_evaluation_share_project_org_global_precedence(data_dir):
    from services.feature_flag_registry import create_flag, evaluate, list_flags

    create_flag({"key": "global.only"})
    create_flag({"key": "same.flag", "enabled": False})
    create_flag({"key": "org.only"}, "organization", "org-1")
    create_flag({"key": "same.flag", "enabled": True}, "organization", "org-1")
    create_flag({"key": "project.only"}, "project", "project-1")
    create_flag({"key": "same.flag", "enabled": False}, "project", "project-1")

    effective = {
        flag["key"]: flag
        for flag in list_flags("project", "project-1", effective=True, org_id="org-1")
    }
    assert set(effective) == {"global.only", "org.only", "project.only", "same.flag"}
    assert effective["same.flag"]["scope_type"] == "project"
    assert evaluate("org.only", project_id="project-1", org_id="org-1")["source"] == "organization"
    assert evaluate("same.flag", project_id="project-1", org_id="org-1")["enabled"] is False


def test_relationship_input_rejects_malformed_self_and_duplicates(data_dir):
    from services.feature_flag_registry import create_flag

    create_flag({"key": "known.flag"})
    for data, message in (
        ({"key": "bad.parent", "parent_key": " "}, "Parent key"),
        ({"key": "bad.prereq", "prerequisites": [" "]}, "Prerequisite key"),
        ({"key": "self.flag", "parent_key": "self.flag"}, "cannot reference itself"),
        ({"key": "duplicate.flag", "prerequisites": ["known.flag", "KNOWN.FLAG"]}, "Duplicate prerequisite"),
        ({"key": "same.rel", "parent_key": "known.flag", "prerequisites": ["known.flag"]}, "also be a prerequisite"),
        ({"key": "invalid.rel", "parent_key": "not/a/key"}, "malformed"),
        ({"key": "unknown.rel", "parent_key": "missing.flag"}, "Unknown parent flag"),
    ):
        with pytest.raises(ValueError, match=message):
            create_flag(data)


def test_rejects_direct_indirect_and_mixed_dependency_cycles(data_dir):
    from services.feature_flag_registry import create_flag, update_flag

    create_flag({"key": "one.flag"})
    create_flag({"key": "two.flag"})
    update_flag("one.flag", {"parent_key": "two.flag"})
    with pytest.raises(ValueError, match=r"Dependency cycle detected: two.flag -> one.flag -> two.flag"):
        update_flag("two.flag", {"parent_key": "one.flag"})

    update_flag("one.flag", {"parent_key": None})
    update_flag("two.flag", {"parent_key": "one.flag"})
    with pytest.raises(ValueError, match=r"Dependency cycle detected: one.flag -> two.flag -> one.flag"):
        update_flag("one.flag", {"prerequisites": ["two.flag"]})

    update_flag("one.flag", {"prerequisites": []})
    create_flag({"key": "three.flag", "prerequisites": ["two.flag"]})
    with pytest.raises(ValueError, match=r"Dependency cycle detected: one.flag -> three.flag -> two.flag -> one.flag"):
        update_flag("one.flag", {"parent_key": "three.flag"})


def test_failed_relationship_update_does_not_save_or_audit(data_dir):
    from services.feature_flag_registry import audit, create_flag, get_flag, update_flag

    create_flag({"key": "stable.flag"}, actor="creator")
    before = get_flag("stable.flag")
    audit_before = audit(key="stable.flag")

    with pytest.raises(ValueError, match="Unknown prerequisite flag 'missing.flag'"):
        update_flag("stable.flag", {"prerequisites": ["missing.flag"]}, actor="editor")

    assert get_flag("stable.flag") == before
    assert audit(key="stable.flag") == audit_before


def test_corrupt_cycle_evaluation_is_safe_and_exposes_trace(data_dir):
    from services.feature_flag_registry import _save, evaluate

    _save([
        {"key": "a.flag", "enabled": True, "environments": {}, "parent_key": "b.flag", "prerequisites": []},
        {"key": "b.flag", "enabled": True, "environments": {}, "parent_key": None, "prerequisites": ["a.flag"]},
    ], "global", None)

    result = evaluate("a.flag")
    assert result["enabled"] is False
    assert result["reason"] == "invalid_dependency_cycle"
    assert result["dependency_path"] == ["a.flag", "b.flag", "a.flag"]
    assert any(item.get("relationship") == "parent" for item in result["trace"])


def test_find_dependents_reports_direct_cross_scope_relationship_impact(data_dir):
    from services.feature_flag_registry import create_flag, find_dependents

    create_flag({"key": "base.flag"})
    create_flag({"key": "org.child", "parent_key": "base.flag"}, "organization", "org-1")
    create_flag({"key": "project.child", "prerequisites": ["base.flag"]}, "project", "project-1")

    impact = find_dependents("base.flag")
    assert {(item["key"], item["scope_type"], item["scope_id"], item["relationship"])
            for item in impact} == {
        ("org.child", "organization", "org-1", "parent"),
        ("project.child", "project", "project-1", "prerequisite"),
    }


def test_global_registry_merges_legacy_records_and_prefers_namespaced_duplicates(data_dir):
    from services.feature_flags import create_flag as create_legacy_flag
    from services.feature_flag_registry import create_flag, list_flags

    create_legacy_flag({"key": "legacy.only", "enabled": True})
    create_legacy_flag({"key": "shared.flag", "enabled": False})
    create_flag({"key": "registry.only", "enabled": True})
    create_flag({"key": "shared.flag", "enabled": True})

    flags = {flag["key"]: flag for flag in list_flags()}
    assert set(flags) == {"legacy.only", "shared.flag", "registry.only"}
    assert flags["shared.flag"]["enabled"] is True


def test_legacy_only_global_flags_are_migrated_for_registry_update_archive_and_delete(data_dir):
    from services.feature_flags import create_flag as create_legacy_flag, get_flag as get_legacy_flag
    from services.feature_flag_registry import archive_flag, audit, create_flag, delete_flag, evaluate, list_flags, update_flag

    create_legacy_flag({"key": "legacy.update", "enabled": True})
    updated = update_flag("legacy.update", {"enabled": False}, actor="editor")

    assert updated and updated["enabled"] is False
    assert get_legacy_flag("legacy.update")["enabled"] is True
    assert {flag["key"]: flag for flag in list_flags()}["legacy.update"]["enabled"] is False
    assert audit(key="legacy.update")[0]["operation"] == "update"

    create_legacy_flag({"key": "legacy.delete", "enabled": True})
    with pytest.raises(ValueError, match="archived"):
        delete_flag("legacy.delete", actor="editor")
    archived = archive_flag("legacy.delete", actor="editor", reason="retired")
    assert archived and archived["archived"] is True and archived["enabled"] is False
    assert get_legacy_flag("legacy.delete")["enabled"] is True
    assert delete_flag("legacy.delete", actor="editor") is True
    assert "legacy.delete" not in {flag["key"] for flag in list_flags()}
    assert evaluate("legacy.delete")["reason"] == "unknown_flag"
    assert [entry["operation"] for entry in audit(key="legacy.delete")[:2]] == ["delete", "archive"]

    create_legacy_flag({"key": "legacy.guarded", "enabled": True})
    create_flag({"key": "legacy.dependent", "parent_key": "legacy.guarded"})
    with pytest.raises(ValueError, match="dependents"):
        archive_flag("legacy.guarded", actor="editor")
    assert get_legacy_flag("legacy.guarded")["enabled"] is True

    create_legacy_flag({"key": "registry.wins", "enabled": True})
    create_flag({"key": "registry.wins", "enabled": False})
    with pytest.raises(ValueError, match="archived"):
        delete_flag("registry.wins", actor="editor")
    archive_flag("registry.wins", actor="editor")
    assert delete_flag("registry.wins", actor="editor") is True
    assert {flag["key"]: flag for flag in list_flags()}["registry.wins"]["enabled"] is True


def test_evaluation_trace_uses_the_relationship_for_each_diamond_path(data_dir):
    from services.feature_flag_registry import create_flag, evaluate

    create_flag({"key": "shared.flag"})
    create_flag({"key": "left.flag", "prerequisites": ["shared.flag"]})
    create_flag({"key": "right.flag", "parent_key": "shared.flag"})
    create_flag({"key": "root.flag", "prerequisites": ["left.flag", "right.flag"]})

    result = evaluate("root.flag")

    assert result["enabled"] is True
    assert [item["relationship"] for item in result["trace"] if item["key"] == "shared.flag"] == [
        "prerequisite", "parent",
    ]


def test_evaluate_project_without_org_id_uses_project_organization(data_dir):
    from services.feature_flag_registry import create_flag, evaluate
    from storage import pg

    pg.execute("INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) VALUES (%s,%s,%s,%s,%s,0,%s)",
               ("project-org", "org-derived", "owner", "Project", "", 0))
    create_flag({"key": "derived.org.flag"}, "organization", "org-derived")
    assert evaluate("derived.org.flag", project_id="project-org")["source"] == "organization"


def test_flags_api_derives_project_organization_for_evaluation(data_dir):
    import flask

    from services.feature_flag_registry import create_flag
    from storage import pg
    from services.org_service import create_org
    from api import feature_flag_routes

    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", ("u-1", "alice", "x"))
    org = create_org("Example", "u-1")
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s)",
        ("project-1", org["id"], "u-1", "Project", "", 0),
    )
    create_flag({"key": "org.only"}, "organization", org["id"])

    app = flask.Flask(__name__)
    app.register_blueprint(feature_flag_routes.bp)
    from auth.service import generate_token
    from auth import middleware
    middleware.set_data_dir(data_dir)
    headers = {"Authorization": f"Bearer {generate_token('u-1', 'alice', [], data_dir, token_type='access')}"}
    with app.test_request_context("/api/flags/evaluate", method="POST", json={"key": "org.only", "project_id": "project-1"}, headers=headers):
        response = feature_flag_routes.api_evaluate_flag()

    assert response.get_json()["source"] == "organization"


def test_lifecycle_dependents_resolve_to_exact_target_without_cross_tenant_leaks(data_dir):
    from services.feature_flag_registry import archive_flag, create_flag, delete_flag, find_dependents, impact
    from storage import pg

    pg.execute("INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) "
               "VALUES (%s,%s,%s,%s,%s,0,%s)", ("project-a", "org-a", "owner", "A", "", 0))
    pg.execute("INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) "
               "VALUES (%s,%s,%s,%s,%s,0,%s)", ("project-b", "org-b", "owner", "B", "", 0))
    create_flag({"key": "shared.target"}, "organization", "org-a")
    create_flag({"key": "shared.target"}, "organization", "org-b")
    create_flag({"key": "a.child", "parent_key": "shared.target"}, "project", "project-a", org_id="org-a")
    create_flag({"key": "b.child", "parent_key": "shared.target"}, "project", "project-b", org_id="org-b")

    org_a_dependents = find_dependents("shared.target", "organization", "org-a")
    assert [(item["key"], item["scope_id"]) for item in org_a_dependents] == [("a.child", "project-a")]
    assert [(item["key"], item["scope_id"]) for item in impact("shared.target", "organization", "org-a")["blockers"]] == [
        ("a.child", "project-a")
    ]
    with pytest.raises(ValueError, match="dependents"):
        archive_flag("shared.target", "organization", "org-a")

    archive_flag("a.child", "project", "project-a", org_id="org-a")
    assert delete_flag("a.child", "project", "project-a", org_id="org-a") is True
    assert archive_flag("shared.target", "organization", "org-a")["archived"] is True
    assert impact("shared.target", "organization", "org-b")["blockers"] == [{
        "key": "b.child", "scope_type": "project", "scope_id": "project-b", "relationship": "parent",
    }]


def test_registry_expiry_archives_lifecycle_and_permanent_delete_guards(data_dir):
    from services.feature_flag_registry import (
        archive_flag,
        audit,
        create_flag,
        delete_flag,
        expire_due_flags,
        get_flag,
        restore_flag,
    )

    create_flag({"key": "expiry.flag", "ttl_seconds": 5}, "organization", "org-1")
    assert expire_due_flags(now=10**10) == 1
    expired = get_flag("expiry.flag", "organization", "org-1")
    assert expired["enabled"] is False
    assert expired["expired_at"] == 10**10
    assert audit("organization", "org-1", "expiry.flag", 1)[0]["operation"] == "expire"

    create_flag({"key": "base.lifecycle"})
    create_flag({"key": "child.lifecycle", "parent_key": "base.lifecycle"})
    with pytest.raises(ValueError, match="dependents"):
        archive_flag("base.lifecycle")
    archived = archive_flag("child.lifecycle", reason="retired", actor="owner")
    assert archived["archived"] is True and archived["enabled"] is False
    from services.feature_flag_registry import update_flag
    with pytest.raises(ValueError, match="archived"):
        update_flag("child.lifecycle", {"enabled": True})
    with pytest.raises(ValueError, match="archived"):
        delete_flag("base.lifecycle")
    restored = restore_flag("child.lifecycle", actor="owner")
    assert restored["archived"] is False and restored["enabled"] is False
    archive_flag("child.lifecycle", actor="owner")
    assert delete_flag("child.lifecycle", actor="owner") is True


def test_legacy_corrupt_relationships_are_normalized_for_dependents(data_dir):
    from services.feature_flag_registry import _save, find_dependents

    _save([
        {"key": "base.corrupt", "enabled": True, "environments": {}},
        {"key": "child.corrupt", "enabled": True, "environments": {}, "parent_key": "  BASE.CORRUPT  ", "prerequisites": []},
        {"key": "prereq.corrupt", "enabled": True, "environments": {}, "prerequisites": [" BASE.CORRUPT "]},
    ], "global", None)
    dependents = find_dependents("base.corrupt")
    assert {(item["key"], item["relationship"]) for item in dependents} == {
        ("child.corrupt", "parent"), ("prereq.corrupt", "prerequisite"),
    }


def test_impact_reports_effective_relationships_lifecycle_and_cross_scope_dependents(data_dir):
    from services.feature_flag_registry import archive_flag, create_flag, impact

    create_flag({"key": "parent.impact"})
    create_flag({"key": "child.impact", "parent_key": "parent.impact"}, "organization", "org-1")
    create_flag({"key": "project.impact", "prerequisites": ["parent.impact"]}, "project", "project-1")
    archive_flag("child.impact", "organization", "org-1")

    result = impact("child.impact", "organization", "org-1")
    assert result["effective_parent"]["key"] == "parent.impact"
    assert result["prerequisites"] == []
    assert result["lifecycle"]["archived"] is True
    assert result["blockers"] == []

    parent_impact = impact("parent.impact")
    assert {(item["key"], item["scope_type"], item["relationship"]) for item in parent_impact["dependents"]} == {
        ("child.impact", "organization", "parent"),
        ("project.impact", "project", "prerequisite"),
    }


def test_legacy_archive_and_delete_rejections_do_not_materialize_registry(data_dir):
    from services.feature_flags import create_flag as create_legacy_flag
    from services.feature_flag_registry import _load_registry, archive_flag, create_flag, delete_flag

    create_legacy_flag({"key": "legacy.blocked", "enabled": True})
    create_flag({"key": "legacy.child", "parent_key": "legacy.blocked"})
    before = _load_registry("global", None)
    with pytest.raises(ValueError, match="dependents"):
        archive_flag("legacy.blocked")
    assert _load_registry("global", None) == before
    with pytest.raises(ValueError, match="archived"):
        delete_flag("legacy.blocked")
    assert _load_registry("global", None) == before


def test_atomic_import_rolls_back_registry_when_audit_write_fails(data_dir, monkeypatch):
    import services.feature_flag_registry as registry

    before_flags = registry.list_flags()
    before_audit = registry.audit()
    monkeypatch.setattr(registry, "_append_history_tx", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("audit unavailable")))
    with pytest.raises(RuntimeError, match="audit unavailable"):
        registry.import_flags([{"key": "atomic.failure"}], actor="importer")
    assert registry.list_flags() == before_flags
    assert registry.audit() == before_audit


def test_atomic_import_accepts_forward_references_and_rolls_back_invalid_batches(data_dir):
    from services.feature_flag_registry import import_flags, list_flags

    result = import_flags([
        {"key": "child.import", "parent_key": "parent.import"},
        {"key": "parent.import"},
    ], actor="importer")
    assert result["batch_id"]
    assert [flag["key"] for flag in result["flags"]] == ["child.import", "parent.import"]

    with pytest.raises(ValueError, match="Dependency cycle"):
        import_flags([
            {"key": "cycle.one", "parent_key": "cycle.two"},
            {"key": "cycle.two", "parent_key": "cycle.one"},
        ])
    assert {flag["key"] for flag in list_flags()} == {"child.import", "parent.import"}

    with pytest.raises(ValueError, match="flags must be a list"):
        import_flags({"not": "a list"})
