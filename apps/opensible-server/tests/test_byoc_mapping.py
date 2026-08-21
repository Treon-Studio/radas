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


def test_legacy_account_without_ownership_is_not_listed(data_dir, pg_db, monkeypatch):
    from services import byoc
    seed_project_stack()
    monkeypatch.setattr(byoc, "_load", lambda: [{"id": ACCOUNT, "name": "legacy", "provider": "hetzner", "credentials": {"secret": "x"}}])
    response = _route_client(data_dir).get(
        "/api/byoc/accounts",
        headers={**_route_headers(data_dir), "X-Project-Id": PROJECT},
    )
    assert response.status_code == 200
    assert response.get_json()["accounts"] == []


def test_account_lifecycle_requires_project_scope_and_owner_role(data_dir, pg_db):
    seed_project_stack()
    from services import byoc
    owned = byoc.create_account({
        "name": "lifecycle-owned",
        "provider": "hetzner",
        "credentials": {"hcloud_token": "x"},
        "org_id": ORG,
        "project_id": PROJECT,
    })
    client = _route_client(data_dir)
    missing_scope = client.get(f"/api/byoc/accounts/{owned['id']}/inventory", headers=_route_headers(data_dir))
    assert missing_scope.status_code == 400
    pg.execute("INSERT INTO users (id,username,password_hash) VALUES (%s,%s,%s)", ("member-279", "member-279", "x"))
    pg.execute("INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)", (ORG, "member-279", "member", time.time()))
    token = generate_token("member-279", "member-279", [], data_dir, token_type="access")
    denied = client.delete(f"/api/byoc/accounts/{owned['id']}", headers={"Authorization": f"Bearer {token}", "X-Project-Id": PROJECT})
    assert denied.status_code == 403


def test_idcloudhost_inventory_normalizes_vps_and_uses_api_key(monkeypatch, data_dir):
    from services import byoc

    account = byoc.create_account({"name": "idch-import", "provider": "idcloudhost", "credentials": {"api_token": "idch-secret"}})
    calls = []

    class Response:
        status_code = 200
        def json(self):
            return [{"uuid": "uuid-1", "id": "id-ignored", "name": "web", "location": "jakarta", "status": "running"}, {"id": "id-2", "name": "worker", "location": "surabaya", "status": "stopped"}]

    class Requests:
        @staticmethod
        def get(url, **kwargs):
            calls.append((url, kwargs))
            return Response()

    monkeypatch.setitem(__import__("sys").modules, "requests", Requests)
    result = byoc.get_inventory(account["id"])

    assert calls == [("https://api.idcloudhost.com/v1/user-resource/vps", {"headers": {"apikey": "idch-secret"}, "timeout": 15})]
    assert result["resources"] == [
        {"type": "vps_instance", "address": "idcloudhost_vps.web", "name": "web", "id": "uuid-1", "region": "jakarta", "status": "running", "created": "", "managed": False, "managed_at": None},
        {"type": "vps_instance", "address": "idcloudhost_vps.worker", "name": "worker", "id": "id-2", "region": "surabaya", "status": "stopped", "created": "", "managed": False, "managed_at": None},
    ]
    assert "idch-secret" not in str(result)


def test_idcloudhost_inventory_malformed_payload_fails_closed(monkeypatch, data_dir):
    from services import byoc

    account = byoc.create_account({"name": "idch-malformed", "provider": "idcloudhost", "credentials": {"api_token": "idch-secret"}})

    class Response:
        status_code = 200
        def json(self):
            return {"unexpected": "object", "token": "idch-secret"}

    class Requests:
        @staticmethod
        def get(*args, **kwargs):
            return Response()

    monkeypatch.setitem(__import__("sys").modules, "requests", Requests)
    result = byoc.get_inventory(account["id"])

    assert result["resources"] == []
    assert "idch-secret" not in str(result)


def test_idcloudhost_inventory_maps_deterministically_and_rejects_duplicate_or_stale_ids(monkeypatch, data_dir):
    from services import byoc
    from services import byoc_import_mapping

    account = byoc.create_account({"name": "idch-map", "provider": "idcloudhost", "credentials": {"api_token": "idch-secret"}, "org_id": "org-idch", "project_id": "project-idch"})
    monkeypatch.setattr(byoc, "get_inventory", lambda _: {"resources": [{"type": "vps_instance", "address": "idcloudhost_vps.web", "name": "web", "id": "uuid-1"}, {"type": "vps_instance", "address": "idcloudhost_vps.worker", "name": "worker", "id": "id-2"}]})
    monkeypatch.setattr(byoc_import_mapping, "_project_org", lambda _: "org-idch")
    monkeypatch.setattr(byoc_import_mapping, "_stack_exists", lambda *_: None)
    monkeypatch.setattr(byoc_import_mapping.org_service, "is_member", lambda *_: True)

    with __import__("pytest").raises(ValueError, match="unique"):
        byoc_import_mapping.prepare_import_mapping(account["id"], project_id="project-idch", stack="stack", resource_ids=["uuid-1", "uuid-1"], actor_id="user")
    with __import__("pytest").raises(ValueError, match="latest inventory"):
        byoc_import_mapping.prepare_import_mapping(account["id"], project_id="project-idch", stack="stack", resource_ids=["stale"], actor_id="user")
    result = byoc_import_mapping.prepare_import_mapping(account["id"], project_id="project-idch", stack="stack", resource_ids=["id-2", "uuid-1"], actor_id="user")
    assert [mapping["resource_id"] for mapping in result["mappings"]] == ["id-2", "uuid-1"]
    assert result["import_block"].index("idcloudhost_vps.worker") < result["import_block"].index("idcloudhost_vps.web")


def test_detect_provider_route_recognizes_generic_openstack_v3_endpoint(data_dir, pg_db):
    response = _route_client(data_dir).post(
        "/api/byoc/providers/detect",
        json={"endpoint": "https://identity.example.net/v3/"},
        headers=_route_headers(data_dir),
    )
    assert response.status_code == 200
    assert response.get_json() == {
        "provider": "openstack",
        "confidence": 1.0,
        "reason": "generic OpenStack identity endpoint matched",
        "endpoint": "https://identity.example.net/v3",
        "region": None,
    }


def test_detect_provider_route_returns_normalized_endpoint_and_region(data_dir, pg_db):
    response = _route_client(data_dir).post(
        "/api/byoc/providers/detect",
        json={"credentials": {"os_auth_url": "https://keystone.gio.space/v3/", "os_region_name": "RegionOne"}},
        headers=_route_headers(data_dir),
    )
    assert response.status_code == 200
    assert response.get_json() == {
        "provider": "openstack",
        "confidence": 1.0,
        "reason": "generic OpenStack identity endpoint matched",
        "endpoint": "https://keystone.gio.space/v3",
        "region": "RegionOne",
    }


def test_detect_provider_route_recognizes_idcloudhost_and_openstack_without_echoing_secrets(data_dir, pg_db):
    client = _route_client(data_dir)
    token = _route_headers(data_dir)
    cases = [
        ({"credentials": {"api_token": "idch-secret"}}, "idcloudhost"),
        ({"credentials": {"os_auth_url": "https://keystone.gio.space/v3", "os_password": "openstack-secret"}}, "openstack"),
    ]
    for payload, provider in cases:
        response = client.post("/api/byoc/providers/detect", json=payload, headers=token)
        assert response.status_code == 200
        assert response.get_json()["provider"] == provider
        assert response.get_json()["confidence"] == 1.0
        assert "secret" not in str(response.get_json())


def test_account_create_emits_audit_event_without_credentials(data_dir, pg_db):
    seed_project_stack()
    client = _route_client(data_dir)
    response = client.post(
        "/api/byoc/accounts",
        json={"name": "create-audited", "provider": "hetzner", "credentials": {"hcloud_token": "secret-create"}},
        headers={**_route_headers(data_dir), "X-Project-Id": PROJECT},
    )
    assert response.status_code == 201
    row = pg.query_one("SELECT actor_user_id, action, target_type, target_id, meta_json FROM audit_log WHERE action=%s ORDER BY id DESC LIMIT 1", ("byoc.account.created",))
    assert row["actor_user_id"] == USER
    assert row["target_type"] == "byoc_account"
    assert json.loads(row["meta_json"])["project_id"] == PROJECT
    assert "secret-create" not in str(row)


def test_account_mutation_emits_audit_event(data_dir, pg_db, monkeypatch):
    seed_project_stack()
    from services import byoc
    account = byoc.create_account({"name": "mutation-audited", "provider": "hetzner", "credentials": {"hcloud_token": "x"}, "org_id": ORG, "project_id": PROJECT})
    monkeypatch.setattr(byoc, "rotate_credentials", lambda account_id, credentials: {"account_id": account_id, "status": "unverified"})
    response = _route_client(data_dir).post(
        f"/api/byoc/accounts/{account['id']}/rotate",
        json={"credentials": {"hcloud_token": "secret-mutation"}},
        headers={**_route_headers(data_dir), "X-Project-Id": PROJECT},
    )
    assert response.status_code == 200
    row = pg.query_one("SELECT action, target_id, meta_json FROM audit_log WHERE action=%s ORDER BY id DESC LIMIT 1", ("byoc.account.mutated",))
    assert row["target_id"] == account["id"]
    assert json.loads(row["meta_json"])["mutation"] == "rotate_credentials"
    assert "secret-mutation" not in str(row)


def test_import_access_emits_audit_event(data_dir, pg_db, monkeypatch):
    seed_project_stack()
    from services import byoc
    account = byoc.create_account({"name": "import-audited", "provider": "hetzner", "credentials": {"hcloud_token": "x"}, "org_id": ORG, "project_id": PROJECT})
    monkeypatch.setattr(
        "services.byoc_import_mapping.prepare_import_mapping",
        lambda *args, **kwargs: {"account_id": account["id"], "project_id": PROJECT, "stack": "network-prod", "resource_count": 1, "mappings": [], "import_block": ""},
    )
    response = _route_client(data_dir).post(
        f"/api/byoc/accounts/{account['id']}/import",
        json={"project_id": PROJECT, "stack": "network-prod", "resource_ids": ["r-1"], "address_overrides": {}},
        headers={**_route_headers(data_dir), "X-Project-Id": PROJECT},
    )
    assert response.status_code == 200
    row = pg.query_one("SELECT action, target_id, meta_json FROM audit_log WHERE action=%s ORDER BY id DESC LIMIT 1", ("byoc.account.imported",))
    assert row["target_id"] == account["id"]
    assert json.loads(row["meta_json"])["project_id"] == PROJECT
    assert "resource_ids" not in json.loads(row["meta_json"])


def test_successful_account_reads_emit_one_safe_audit_event_per_endpoint(data_dir, pg_db, monkeypatch):
    seed_project_stack()
    from services import byoc
    account = byoc.create_account({
        "name": "audited-account",
        "provider": "hetzner",
        "credentials": {"hcloud_token": "never-audit-this"},
        "org_id": ORG,
        "project_id": PROJECT,
    })
    monkeypatch.setattr(byoc, "get_inventory", lambda _: {"account_id": account["id"], "resources": [], "count": 0, "managed_count": 0, "meta": {"endpoint": "never-audit-this"}})
    monkeypatch.setattr(byoc, "inventory_drift", lambda _: {"drifted": False})
    monkeypatch.setattr(byoc, "list_inventory_snapshots", lambda *_: [])
    monkeypatch.setattr(byoc, "list_managed_resources", lambda _: [])
    monkeypatch.setattr(byoc, "check_account_budget", lambda _: {"configured": False})
    monkeypatch.setattr(byoc, "estimate_account_cost", lambda _: {"monthly": 0})

    client = _route_client(data_dir)
    headers = {**_route_headers(data_dir), "X-Project-Id": PROJECT}
    routes = [
        f"/api/byoc/accounts/{account['id']}/inventory",
        f"/api/byoc/accounts/{account['id']}/inventory/drift",
        f"/api/byoc/accounts/{account['id']}/inventory/snapshots",
        f"/api/byoc/accounts/{account['id']}/managed-resources",
        f"/api/byoc/accounts/{account['id']}/budget/check",
        f"/api/byoc/accounts/{account['id']}/cost",
    ]
    for route in routes:
        response = client.get(route, headers=headers)
        assert response.status_code == 200

    rows = pg.query_all(
        "SELECT actor_user_id, target_type, target_id, meta_json FROM audit_log "
        "WHERE action=%s ORDER BY id",
        ("byoc.account.accessed",),
    )
    assert len(rows) == len(routes)
    assert all(row["actor_user_id"] == USER for row in rows)
    assert all(row["target_type"] == "byoc_account" for row in rows)
    assert all(row["target_id"] == account["id"] for row in rows)
    assert all(json.loads(row["meta_json"])["project_id"] == PROJECT for row in rows)
    assert all(json.loads(row["meta_json"])["org_id"] == ORG for row in rows)
    assert "never-audit-this" not in str(rows)


def test_denied_account_read_emits_no_audit_event(data_dir, pg_db):
    seed_project_stack()
    from services import byoc
    account = byoc.create_account({"name": "denied-account", "provider": "hetzner", "credentials": {"hcloud_token": "x"}, "org_id": ORG, "project_id": PROJECT})
    response = _route_client(data_dir).get(f"/api/byoc/accounts/{account['id']}/inventory")
    assert response.status_code == 401
    assert pg.query_one("SELECT COUNT(*) AS count FROM audit_log WHERE action=%s", ("byoc.account.accessed",))["count"] == 0


def test_byoc_account_access_audit_is_available_through_tenant_scoped_export(data_dir, pg_db, monkeypatch):
    seed_project_stack()
    from services import byoc
    account = byoc.create_account({"name": "export-account", "provider": "hetzner", "credentials": {"hcloud_token": "x"}, "org_id": ORG, "project_id": PROJECT})
    monkeypatch.setattr(byoc, "get_inventory", lambda _: {"account_id": account["id"], "resources": [], "count": 0, "managed_count": 0, "meta": {}})
    client = _route_client(data_dir)
    headers = {**_route_headers(data_dir), "X-Project-Id": PROJECT}
    assert client.get(f"/api/byoc/accounts/{account['id']}/inventory", headers=headers).status_code == 200
    export = client.get(f"/api/audit-log?target_type=byoc_account&target_id={account['id']}&format=csv", headers=headers)
    assert export.status_code == 200
    body = export.get_data(as_text=True)
    assert account["id"] in body
    assert "byoc.account.accessed" in body
    assert "hcloud_token" not in body


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
    from services import byoc
    byoc.create_account({"name": "route-import", "provider": "hetzner", "credentials": {"hcloud_token": "x"}, "org_id": ORG, "project_id": PROJECT})
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
    owned_account = byoc.create_account({"name": "route-import-2", "provider": "hetzner", "credentials": {"hcloud_token": "x"}, "org_id": ORG, "project_id": PROJECT})
    response = client.post(
        f"/api/byoc/accounts/{owned_account['id']}/import",
        json={"project_id": PROJECT, "stack": "network-prod", "resource_ids": ["r-a"], "address_overrides": {}},
        headers={**_route_headers(data_dir), "X-Project-Id": PROJECT},
    )
    assert response.status_code == 200, response.get_json()
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
