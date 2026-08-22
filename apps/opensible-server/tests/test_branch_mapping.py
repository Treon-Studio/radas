"""Tests for Branch-to-Environment Mapping (UC339).

Verifies rule storage, retrieval, regex validation, and environment resolution.
"""
from __future__ import annotations

import time
import pytest
from storage import pg
from services import branch_mapping


def _setup_project(project_id: str = "proj-branch"):
    now = time.time()
    org_id = f"org-{project_id}"
    pg.execute(
        "INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s, %s, %s, %s) "
        "ON CONFLICT (id) DO NOTHING",
        (org_id, org_id, "owner", now),
    )
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, created_at, updated_at) "
        "VALUES (%s, %s, %s, %s, %s, 0, %s, %s) ON CONFLICT (id) DO NOTHING",
        (project_id, org_id, "owner", project_id, "", now, now),
    )


def test_branch_mapping_crud_and_resolution(pg_db):
    project_id = "proj-bm-1"
    stack = "app"
    _setup_project(project_id)

    # 1. Empty initially
    rules = branch_mapping.get_mapping(project_id, stack)
    assert rules == []

    # Fallback to dev
    res = branch_mapping.resolve_environment(project_id, stack, "feature/xyz")
    assert res["environment"] == "dev"
    assert res["stack_override"] is None

    # 2. Set mapping rules
    valid_rules = [
        {"pattern": r"^main$", "environment": "prod"},
        {"pattern": r"^staging$", "environment": "staging"},
        {"pattern": r"^preview/.*$", "environment": "preview", "stack_override": "app-preview"},
        {"pattern": r"^test/.*$", "environment": "test"},
    ]
    branch_mapping.set_mapping(project_id, stack, valid_rules)

    saved = branch_mapping.get_mapping(project_id, stack)
    assert len(saved) == 4
    assert saved[0]["pattern"] == r"^main$"
    assert saved[0]["environment"] == "prod"

    # 3. Test resolutions
    m1 = branch_mapping.resolve_environment(project_id, stack, "main")
    assert m1["environment"] == "prod"
    assert m1["stack_override"] is None

    m2 = branch_mapping.resolve_environment(project_id, stack, "staging")
    assert m2["environment"] == "staging"

    m3 = branch_mapping.resolve_environment(project_id, stack, "preview/pr-42")
    assert m3["environment"] == "preview"
    assert m3["stack_override"] == "app-preview"

    m4 = branch_mapping.resolve_environment(project_id, stack, "random-feature-branch")
    assert m4["environment"] == "dev"


def test_branch_mapping_validation(pg_db):
    project_id = "proj-bm-val"
    stack = "core"
    _setup_project(project_id)

    # Missing pattern
    with pytest.raises(ValueError, match="Each rule must have a 'pattern'"):
        branch_mapping.set_mapping(project_id, stack, [{"environment": "prod"}])

    # Invalid regex pattern
    with pytest.raises(ValueError, match="Invalid regex pattern"):
        branch_mapping.set_mapping(project_id, stack, [{"pattern": "[unclosed-bracket", "environment": "prod"}])

    # Invalid environment
    with pytest.raises(ValueError, match="Invalid environment"):
        branch_mapping.set_mapping(project_id, stack, [{"pattern": "^main$", "environment": "invalid_env"}])

    # Invalid stack_override type
    with pytest.raises(ValueError, match="stack_override must be a string"):
        branch_mapping.set_mapping(project_id, stack, [{"pattern": "^main$", "environment": "prod", "stack_override": 123}])
