"""Contract tests for the versioned service catalog backend."""
from __future__ import annotations

import copy
import time
from pathlib import Path

import flask
import pytest

from api import register_blueprints
from auth.service import generate_token
from services import service_catalog
from services.org_service import add_member, create_org
from storage import pg


def _manifest(slug: str = "demo-service", version: str = "1.0.0") -> dict:
    return {
        "schema_version": 1,
        "slug": slug,
        "name": "Demo Service",
        "version": version,
        "category": "web",
        "summary": "A harmless test service",
        "runtime": "container",
        "image": "example/demo:1.2.3",
        "production_ready": False,
        "persistence": "required",
        "inputs": [{"name": "memory_mb", "type": "integer", "default": 512, "min": 128, "max": 4096}],
        "secrets": [{"name": "admin_password", "required": True, "description": "Admin credential reference"}],
        "storage": [{"name": "data", "size_gb": 5, "required": True, "mount_path": "/data"}],
        "ports": [{"name": "http", "port": 8080, "public": True}],
        "endpoints": [{"name": "endpoint", "port": "http", "path": "/", "public": True}],
        "healthcheck": {"path": "/healthz", "port": 8080, "interval_seconds": 30},
        "outputs": ["endpoint", "admin_url"],
        "supported_runtimes": ["docker", "podman", "kubernetes"],
        "minimum_resources": {"cpu_millicores": 100, "memory_mb": 512, "storage_gb": 5},
    }


def _app(data_dir: Path):
    from auth import middleware
    middleware.set_data_dir(data_dir)
    app = flask.Flask(__name__)
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    return app


def _headers(user_id: str, username: str, roles: list[str], data_dir: Path, org_id: str | None = None):
    token = generate_token(user_id, username, roles, data_dir, token_type="access", org_id=org_id)
    return {"Authorization": f"Bearer {token}"}


def test_manifest_validation_covers_required_rules():
    manifest = _manifest()
    manifest["ports"] = [{"name": "http", "port": 8080, "public": True}]
    assert service_catalog.validate_manifest(manifest) == []
    invalid = copy.deepcopy(manifest)
    invalid["slug"] = "Bad Slug"
    invalid["version"] = "v1"
    invalid["image"] = "example/demo:latest"
    invalid["inputs"][0]["default"] = 99999
    invalid["secrets"][0]["name"] = "password with spaces"
    invalid["storage"][0]["mount_path"] = "/"
    invalid["healthcheck"]["port"] = 70000
    invalid["outputs"] = ["Endpoint"]
    invalid["supported_runtimes"] = []
    invalid["ports"] = []
    errors = service_catalog.validate_manifest(invalid)
    assert {item["path"] for item in errors} >= {
        "slug", "version", "image", "inputs.0", "secrets.0.name", "storage.0.mount_path",
        "healthcheck.port", "outputs", "supported_runtimes",
    }


def test_recommended_seed_is_explicit_and_idempotent(pg_db):
    first = service_catalog.seed_recommended_definitions()
    pg.execute("UPDATE service_definitions SET disabled = TRUE WHERE slug = %s", ("n8n",))
    second = service_catalog.seed_recommended_definitions()
    assert len(first) == len(second) == 11
    assert {item["slug"] for item in first} == {
        "n8n", "activepieces", "waha-plus", "postgresql", "redis", "minio",
        "uptime-kuma", "grafana", "wordpress", "static-web", "custom-container",
    }
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_definitions")["count"] == 11
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_definition_versions")["count"] == 11
    assert pg.query_one("SELECT disabled FROM service_definitions WHERE slug = %s", ("n8n",))["disabled"] is True
    assert all(":latest" not in item["manifest"]["image"] for item in first)
    waha = next(item for item in first if item["slug"] == "waha-plus")
    assert waha["manifest"]["metadata"]["license_policy"] == "requires_valid_waha_license_for_production"
    assert set(waha["manifest"]["lifecycle"]) == {"start", "stop", "restart", "update", "rollback", "destroy"}
    assert waha["manifest"]["ports"] and waha["manifest"]["endpoints"]


def test_immutable_versions_and_duplicate_conflicts(pg_db):
    one = service_catalog.publish_definition(_manifest(version="1.1.0"), "u1", None)
    two = service_catalog.publish_definition(_manifest(version="1.0.0"), "u1", None)
    assert one["id"] == two["id"]
    assert service_catalog.get_definition("demo-service")["version"] == "1.1.0"
    assert service_catalog.get_definition("demo-service", "1.0.0")["manifest"]["version"] == "1.0.0"
    with pytest.raises(service_catalog.CatalogConflictError):
        service_catalog.publish_definition(_manifest(version="1.0.0"), "u1", None)
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_definition_versions")["count"] == 2


def test_nested_metadata_is_redacted_before_persistence(pg_db):
    manifest = _manifest("nested-secrets")
    manifest["metadata"] = {
        "safe": {"label": "visible"},
        "deployment": {"credentials": {"password": "raw-password", "token": "raw-token"}},
        "items": [{"api_key": "raw-key", "nested": {"value": "raw-value"}}],
    }
    result = service_catalog.publish_definition(manifest, "u1", None)
    assert result["manifest"]["metadata"]["safe"] == {"label": "visible"}
    assert result["manifest"]["metadata"]["deployment"]["credentials"]["password"] == "[REDACTED]"
    stored = pg.query_one("SELECT manifest FROM service_definition_versions WHERE definition_id = %s", (result["id"],))["manifest"]
    assert "raw-password" not in str(stored)
    assert "raw-key" not in str(stored)


def test_audit_failure_rolls_back_publication(pg_db, monkeypatch):
    monkeypatch.setattr(service_catalog, "_audit_publication", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("audit down")))
    with pytest.raises(service_catalog.CatalogConflictError):
        service_catalog.publish_definition(_manifest("audit-failure"), "u1", None)
    assert pg.query_one("SELECT 1 FROM service_definitions WHERE slug = %s", ("audit-failure",)) is None


def _seed_users(data_dir: Path):
    for uid in ("owner", "admin", "publisher", "publish-only", "jwt-only", "member", "outsider"):
        pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", (uid, uid, "x"))
    pg.execute(
        "INSERT INTO roles (id, name, description, is_system) VALUES (%s,%s,%s,1)",
        ("role-admin", "admin", "Authoritative test administrator"),
    )
    # Keep the admin role unpermissioned here so the role and permission
    # authorization paths are independently covered.
    pg.execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s,%s)", ("admin", "role-admin"))
    pg.execute(
        "INSERT INTO permissions (id, name, description, resource, action) VALUES "
        "(%s,%s,%s,%s,%s), (%s,%s,%s,%s,%s)",
        ("perm-catalog-publish", "catalog.publish", "Publish catalog entries", "catalog", "publish",
         "perm-catalog-admin", "catalog.admin", "Administer the catalog", "catalog", "admin"),
    )
    pg.execute(
        "INSERT INTO roles (id, name, description, is_system) VALUES "
        "(%s,%s,%s,0), (%s,%s,%s,0)",
        ("role-catalog-admin", "catalog-publisher", "Catalog administrator",
         "role-catalog-publish", "catalog-publish-only", "Catalog publisher"),
    )
    pg.execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s,%s), (%s,%s)",
               ("publisher", "role-catalog-admin", "publish-only", "role-catalog-publish"))
    pg.execute("INSERT INTO role_permissions (role_id, permission_id) VALUES (%s,%s), (%s,%s)",
               ("role-catalog-admin", "perm-catalog-admin", "role-catalog-publish", "perm-catalog-publish"))
    org = create_org("Org A", "owner")
    add_member(org["id"], "admin", "admin")
    add_member(org["id"], "member", "member")
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, updated_at) VALUES (%s,%s,%s,%s,%s,0,%s)",
        ("project-a", org["id"], "owner", "Project A", "", time.time()),
    )
    return org["id"], {
        "owner": _headers("owner", "owner", [], data_dir),
        "admin": _headers("admin", "admin", [], data_dir),
        "publisher": _headers("publisher", "publisher", [], data_dir),
        "jwt_only": _headers("jwt-only", "jwt-only", ["admin"], data_dir),
        "member": _headers("member", "member", [], data_dir),
        "outsider": _headers("outsider", "outsider", [], data_dir),
        "global_admin": _headers("admin", "admin", ["admin"], data_dir),
    }


def test_catalog_list_detail_and_secret_declaration_non_leak(data_dir):
    service_catalog.seed_recommended_definitions()
    client = _app(data_dir).test_client()
    headers = _headers("reader", "reader", [], data_dir)
    listed = client.get("/api/platform/catalog", headers=headers)
    assert listed.status_code == 200
    assert len(listed.get_json()["data"]["definitions"]) == 11
    detail = client.get("/api/platform/catalog/n8n", headers=headers)
    assert detail.status_code == 200
    body = detail.get_json()
    assert body["data"]["definition"]["manifest"]["secrets"]
    assert "value" not in body["data"]["definition"]["manifest"]["secrets"][0]
    assert "credential" not in detail.get_data(as_text=True).lower()


def test_disabled_private_definition_shadows_platform(data_dir):
    org_id, tokens = _seed_users(data_dir)
    service_catalog.publish_definition(_manifest("shadowed"), "platform-owner", None, scope="platform")
    private = service_catalog.publish_definition(_manifest("shadowed"), "owner", org_id, scope="organization")
    pg.execute("UPDATE service_definitions SET disabled = TRUE WHERE id = %s", (private["id"],))
    assert service_catalog.get_definition("shadowed", org_id=org_id) is None
    assert not any(item["slug"] == "shadowed" for item in service_catalog.list_definitions(org_id))
    assert service_catalog.get_definition("shadowed", org_id=org_id, include_disabled=True)["disabled"] is True


def test_private_org_isolation_and_owner_admin_authorization(data_dir):
    org_id, tokens = _seed_users(data_dir)
    app = _app(data_dir)
    client = app.test_client()
    private = _manifest("private-demo")
    published = client.post(
        "/api/projects/project-a/catalog",
        json={"manifest": private},
        headers=tokens["member"],
    )
    assert published.status_code == 403
    published = client.post(
        "/api/projects/project-a/catalog",
        json={"manifest": private},
        headers=tokens["owner"],
    )
    assert published.status_code == 201
    assert client.get("/api/platform/catalog", headers=tokens["member"]).status_code == 200
    project_list = client.get("/api/projects/project-a/catalog", headers=tokens["member"])
    assert any(item["slug"] == "private-demo" for item in project_list.get_json()["data"]["definitions"])
    outsider = client.get("/api/projects/project-a/catalog", headers=tokens["outsider"])
    assert outsider.status_code == 403
    assert client.get("/api/platform/catalog?org_id=%s" % org_id, headers=tokens["member"]).status_code == 422
    assert client.get("/api/platform/catalog", headers=tokens["outsider"]).status_code == 200
    global_publish = client.post(
        "/api/platform/catalog", json={"manifest": _manifest("global-demo")}, headers=tokens["owner"]
    )
    assert global_publish.status_code == 403
    assert client.post(
        "/api/platform/catalog", json={"manifest": _manifest("global-demo")}, headers=tokens["global_admin"]
    ).status_code == 201
    stale_jwt_role = client.post(
        "/api/platform/catalog", json={"manifest": _manifest("jwt-only-demo")}, headers=tokens["jwt_only"]
    )
    assert stale_jwt_role.status_code == 403
    permission_publish = client.post(
        "/api/platform/catalog", json={"manifest": _manifest("permission-demo")}, headers=tokens["admin"]
    )
    assert permission_publish.status_code == 201


def test_catalog_rbac_permissions_grant_and_deny_platform_publish(data_dir):
    _seed_users(data_dir)
    client = _app(data_dir).test_client()

    catalog_admin = client.post(
        "/api/platform/catalog",
        json={"manifest": _manifest("catalog-admin-demo")},
        headers=_headers("publisher", "publisher", [], data_dir),
    )
    assert catalog_admin.status_code == 201

    publish_only = client.post(
        "/api/platform/catalog",
        json={"manifest": _manifest("catalog-publish-demo")},
        headers=_headers("publish-only", "publish-only", [], data_dir),
    )
    assert publish_only.status_code == 201

    denied = client.post(
        "/api/platform/catalog",
        json={"manifest": _manifest("catalog-denied-demo")},
        headers=_headers("outsider", "outsider", [], data_dir),
    )
    assert denied.status_code == 403

    # A JWT role claim and file-backed state must not grant publication.
    jwt_only = client.post(
        "/api/platform/catalog",
        json={"manifest": _manifest("catalog-jwt-only-demo")},
        headers=_headers("jwt-only", "jwt-only", ["admin"], data_dir),
    )
    assert jwt_only.status_code == 403


def test_invalid_input_and_error_envelopes(data_dir):
    client = _app(data_dir).test_client()
    headers = _headers("u1", "u1", [], data_dir)
    assert client.get("/api/platform/catalog", headers=headers).status_code == 200
    invalid_json = client.post("/api/platform/catalog", data="[]", content_type="application/json", headers=headers)
    assert invalid_json.status_code == 422
    assert invalid_json.get_json()["error"]["code"] == "VALIDATION_ERROR"
    pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", ("admin", "admin", "x"))
    pg.execute("INSERT INTO roles (id, name, description, is_system) VALUES (%s,%s,%s,1)", ("role-admin", "admin", "Admin"))
    pg.execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s,%s)", ("admin", "role-admin"))
    bad = _manifest("bad-demo")
    bad["image"] = "example/demo:latest"
    response = client.post("/api/platform/catalog", json={"manifest": bad}, headers=_headers("admin", "admin", ["stale"], data_dir))
    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.get_json()["request_id"] == response.headers["X-Request-ID"]


def test_unauthenticated_catalog_is_rejected(data_dir):
    response = _app(data_dir).test_client().get("/api/platform/catalog")
    assert response.status_code == 401
