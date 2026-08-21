from __future__ import annotations

import time

import pytest
from psycopg.types.json import Jsonb

from storage import pg
from services import byoc_import_mapping

ACCOUNT = "account-279"
PROJECT = "project-279"
ORG = "org-279"
USER = "user-279"


def seed_project_stack():
    now = time.time()
    pg.execute("INSERT INTO users (id,username,password_hash) VALUES (%s,%s,%s)", (USER, USER, "x"))
    pg.execute("INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)", (ORG, ORG, USER, now))
    pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)", (ORG, USER, "owner", now))
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s)",
        (PROJECT, ORG, USER, PROJECT, "", now),
    )
    pg.execute(
        "INSERT INTO stack_meta (project_id,stack,data) VALUES (%s,%s,%s)",
        (PROJECT, "network-prod", Jsonb({})),
    )


def patch_inventory(monkeypatch, *, account_org=ORG, account_project=PROJECT):
    monkeypatch.setattr(
        byoc_import_mapping.byoc,
        "get_account",
        lambda account_id: {
            "id": ACCOUNT,
            "provider": "hetzner",
            "org_id": account_org,
            "project_id": account_project,
        },
    )
    monkeypatch.setattr(
        byoc_import_mapping.byoc,
        "get_inventory",
        lambda account_id: {
            "resources": [
                {"id": "r-z", "type": "hcloud_server", "address": "hcloud_server.z"},
                {"id": "r-a", "type": "hcloud_server", "address": "hcloud_server.a"},
            ]
        },
    )


def test_prepare_mapping_is_sorted_and_uses_safe_override(monkeypatch, pg_db):
    seed_project_stack()
    patch_inventory(monkeypatch)

    result = byoc_import_mapping.prepare_import_mapping(
        ACCOUNT,
        project_id=PROJECT,
        stack="network-prod",
        resource_ids=["r-z", "r-a"],
        address_overrides={"r-z": "hcloud_server.web"},
        actor_id=USER,
    )

    assert [item["resource_id"] for item in result["mappings"]] == ["r-a", "r-z"]
    assert result["mappings"][1]["address"] == "hcloud_server.web"
    assert result["mappings"][1]["source"] == "override"
    assert result["import_block"].index("hcloud_server.a") < result["import_block"].index("hcloud_server.web")


def test_mapping_rejects_invalid_or_duplicate_addresses(monkeypatch, pg_db):
    seed_project_stack()
    monkeypatch.setattr(
        byoc_import_mapping.byoc,
        "get_account",
        lambda _: {"id": ACCOUNT, "provider": "hetzner", "org_id": ORG, "project_id": PROJECT},
    )
    monkeypatch.setattr(
        byoc_import_mapping.byoc,
        "get_inventory",
        lambda _: {
            "resources": [
                {"id": "r-1", "type": "hcloud_server", "address": "hcloud_server.one"},
                {"id": "r-2", "type": "hcloud_server", "address": "hcloud_server.two"},
            ]
        },
    )
    with pytest.raises(ValueError, match="address"):
        byoc_import_mapping.prepare_import_mapping(
            ACCOUNT,
            project_id=PROJECT,
            stack="network-prod",
            resource_ids=["r-1"],
            address_overrides={"r-1": "../../escape"},
            actor_id=USER,
        )
    with pytest.raises(ValueError, match="duplicate address"):
        byoc_import_mapping.prepare_import_mapping(
            ACCOUNT,
            project_id=PROJECT,
            stack="network-prod",
            resource_ids=["r-1", "r-2"],
            address_overrides={"r-1": "hcloud_server.same", "r-2": "hcloud_server.same"},
            actor_id=USER,
        )


def test_mapping_requires_explicit_scope_and_rejects_cross_tenant(monkeypatch, pg_db):
    seed_project_stack()
    patch_inventory(monkeypatch, account_org="other-org", account_project="other-project")
    with pytest.raises(ValueError, match="tenant|access"):
        byoc_import_mapping.prepare_import_mapping(
            ACCOUNT,
            project_id=PROJECT,
            stack="network-prod",
            resource_ids=["r-z"],
            actor_id=USER,
        )
    with pytest.raises(ValueError, match="required"):
        byoc_import_mapping.prepare_import_mapping(
            ACCOUNT,
            project_id="",
            stack="network-prod",
            resource_ids=["r-z"],
            actor_id=USER,
        )


def test_mapping_persists_only_redacted_intent_and_does_not_queue_execution(monkeypatch, pg_db):
    seed_project_stack()
    patch_inventory(monkeypatch)
    monkeypatch.setattr(
        byoc_import_mapping.byoc,
        "get_account",
        lambda _: {
            "id": ACCOUNT,
            "provider": "hetzner",
            "org_id": ORG,
            "project_id": PROJECT,
            "credentials": {"secret": "never-return"},
        },
    )

    result = byoc_import_mapping.prepare_import_mapping(
        ACCOUNT,
        project_id=PROJECT,
        stack="network-prod",
        resource_ids=["r-z"],
        actor_id=USER,
    )

    assert result["resource_count"] == 1
    stored = pg.query_one("SELECT data FROM stack_meta WHERE project_id=%s AND stack=%s", (PROJECT, "network-prod"))
    assert stored["data"]["byoc_import_mapping"]["account_id"] == ACCOUNT
    assert stored["data"]["byoc_import_mapping"]["mappings"][0]["address"] == "hcloud_server.z"
    assert "never-return" not in str(stored)
    assert pg.query_one("SELECT COUNT(*) AS count FROM executions WHERE project_id=%s", (PROJECT,))["count"] == 0
