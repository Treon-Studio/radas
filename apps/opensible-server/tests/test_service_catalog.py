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
    errors = service_catalog.validate_manifest(invalid)
    assert {item["path"] for item in errors} >= {
        "slug", "version", "image", "inputs.0", "secrets.0.name", "storage.0.mount_path",
        "healthcheck.port", "outputs", "supported_runtimes",
    }


def test_recommended_seed_is_explicit_and_idempotent(pg_db):
    first = service_catalog.seed_recommended_definitions()
    second = service_catalog.seed_recommended_definitions()
    assert len(first) == len(second) == 11
    assert {item["slug"] for item in first} == {
        "n8n", "activepieces", "waha-plus", "postgresql", "redis", "minio",
        "uptime-kuma", "grafana", "wordpress", "static-web", "custom-container",
    }
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_definitions")["count"] == 11
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_definition_versions")["count"] == 11
    assert all(":latest" not in item["manifest"]["image"] for item in first)
    waha = next(item for item in first if item["slug"] == "waha-plus")
    assert waha["manifest"]["metadata"]["license_policy"] == "requires_valid_waha_license_for_production"
    assert set(waha["manifest"]["lifecycle"]) == {"start", "stop", "restart", "update", "rollback", "destroy"}
    assert waha["manifest"]["ports"] and waha["manifest"]["endpoints"]


def test_immutable_versions_and_duplicate_conflicts(pg_db):
    one = service_catalog.publish_definition(_manifest(version="1.0.0"), "u1", None)
    two = service_catalog.publish_definition(_manifest(version="1.1.0"), "u1", None)
    assert one["id"] == two["id"]
    assert service_catalog.get_definition("demo-service", "1.0.0")["manifest"]["version"] == "1.0.0"
    with pytest.raises(service_catalog.CatalogConflictError):
        service_catalog.publish_definition(_manifest(version="1.0.0"), "u1", None)
    assert pg.query_one("SELECT COUNT(*) AS count FROM service_definition_versions")["count"] == 2


def _seed_users(data_dir: Path):
    for uid in ("owner", "admin", "member", "outsider"):
        pg.execute("INSERT INTO users (id, username, password_hash) VALUES (%s,%s,%s)", (uid, uid, "x"))
    pg.execute(
        "INSERT INTO roles (id, name, description, is_system) VALUES (%s,%s,%s,1)",
        ("role-admin", "admin", "Authoritative test administrator"),
    )
    pg.execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s,%s)", ("admin", "role-admin"))
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
