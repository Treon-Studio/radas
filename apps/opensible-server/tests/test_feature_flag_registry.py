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
