from __future__ import annotations

import json
import time

import flask
import pytest
from psycopg.types.json import Jsonb

from api import register_blueprints
from auth.service import generate_token
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


def _route_client(data_dir):
    from auth import middleware

    middleware.set_data_dir(data_dir)
    from app_context import set_data_dir
    set_data_dir(data_dir)
    app = flask.Flask("byoc-mapping-route-tests")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    return app.test_client()


def _route_headers(data_dir):
    token = generate_token(USER, USER, [], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}"}


def test_create_account_persists_explicit_project_and_org_ownership(data_dir, pg_db):
    from services import byoc

    account = byoc.create_account({
        "name": "owned-account",
        "provider": "hetzner",
        "credentials": {"hcloud_token": "x"},
        "org_id": ORG,
        "project_id": PROJECT,
    })

    stored = byoc.get_account(account["id"])
    assert stored["org_id"] == ORG
    assert stored["project_id"] == PROJECT


def test_create_account_route_derives_durable_project_ownership(data_dir, pg_db):
    seed_project_stack()
    client = _route_client(data_dir)
    response = client.post(
        "/api/byoc/accounts",
        json={"name": "route-owned", "provider": "hetzner", "credentials": {"hcloud_token": "x"}},
        headers={**_route_headers(data_dir), "X-Project-Id": PROJECT},
    )
    assert response.status_code == 201
    account_id = response.get_json()["account"]["id"]
    from services import byoc
    stored = byoc.get_account(account_id)
    assert stored["org_id"] == ORG
    assert stored["project_id"] == PROJECT


def test_import_route_requires_explicit_scope(data_dir, pg_db):
    seed_project_stack()
    client = _route_client(data_dir)
    response = client.post(
        f"/api/byoc/accounts/{ACCOUNT}/import",
        json={"resource_ids": ["r-a"]},
        headers=_route_headers(data_dir),
    )
    assert response.status_code == 400
    assert "stack" in str(response.get_json())


def test_import_route_returns_project_scoped_mapping(data_dir, pg_db, monkeypatch):
    seed_project_stack()
    monkeypatch.setattr(
        "services.byoc_import_mapping.prepare_import_mapping",
        lambda *args, **kwargs: {
            "account_id": ACCOUNT,
            "project_id": PROJECT,
            "stack": "network-prod",
            "provider": "hetzner",
            "resource_count": 1,
            "mappings": [{"resource_id": "r-a", "type": "hcloud_server", "address": "hcloud_server.web", "source": "inventory", "mapped_at": 1}],
            "import_block": 'import {\n  to = hcloud_server.web\n  id = "r-a"\n}',
        },
    )
    client = _route_client(data_dir)
    response = client.post(
        f"/api/byoc/accounts/{ACCOUNT}/import",
        json={"project_id": PROJECT, "stack": "network-prod", "resource_ids": ["r-a"], "address_overrides": {}},
        headers=_route_headers(data_dir),
    )
    assert response.status_code == 200
    assert response.get_json()["project_id"] == PROJECT
    assert response.get_json()["stack"] == "network-prod"


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
    assert stored["data"]["byoc_import_mapping"]["project_id"] == PROJECT
    assert pg.query_one("SELECT COUNT(*) AS count FROM executions WHERE project_id=%s", (PROJECT,))["count"] == 0


def test_mapping_rejects_account_without_durable_ownership(monkeypatch, pg_db):
    seed_project_stack()
    monkeypatch.setattr(
        byoc_import_mapping.byoc,
        "get_account",
        lambda _: {"id": ACCOUNT, "provider": "hetzner", "org_id": "", "project_id": ""},
    )
    monkeypatch.setattr(
        byoc_import_mapping.byoc,
        "get_inventory",
        lambda _: {"resources": [{"id": "r-a", "type": "hcloud_server", "address": "hcloud_server.a"}]},
    )
    with pytest.raises(ValueError, match="ownership"):
        byoc_import_mapping.prepare_import_mapping(
            ACCOUNT,
            project_id=PROJECT,
            stack="network-prod",
            resource_ids=["r-a"],
            actor_id=USER,
        )
