"""CLI/server integration contract — server reference half (Task 3.4, 2026-08-27 plan).

Exercises the exact HTTP contract the RADAS CLI depends on for the
"login → choose project → one read → one idempotent mutation" flow, against
the real blueprints (auth_routes, projects_routes, service_instance_routes)
and real PostgreSQL test data (pg_db fixture — no Docker, no cloud creds).

This file is the *direct server request* reference for
apps/cli/internal/integration/server_contract_test.go: the Go contract test
asserts the same status codes, X-Request-ID presence, project scoping,
idempotency replay semantics, and error codes proven here.

Contract pinned here:

* POST /api/auth/login {username, password} ->
    200 {success, access_token, refresh_token, orgs, active_org_id, user}
* GET  /api/projects  Bearer -> 200 {success, projects: [{id, name, orgId, ...}]}
    (legacy envelope the CLI parses; org-scoped: only projects of orgs the
    user belongs to are visible)
* GET  /api/projects/<pid>/services  Bearer ->
    200 {data: {services: [...]}, request_id} + X-Request-ID header
    (platform-namespace envelope: request_id in body AND header)
* POST /api/projects/<pid>/services  Bearer, deploy=true, Idempotency-Key:
    202 {operation, data: {operation}, request_id}   (queued; no worker needed)
    replay same key + identical body -> the SAME response envelope, replayed
    replay same key + other payload  -> 409 {error: {code: CONFLICT}}
    missing key                      -> 400 {error: {code: SERVICE_VALIDATION_FAILED}}
* POST /api/projects/<pid>/services without deploy (draft create):
    201 {data: {service: {...}}, request_id}; replaying the same key with an
    identical body returns the SAME service id (cached envelope), so clients
    can retry draft creates safely too.

Idempotency is enforced in two layers, and this test pins BOTH because the
app-level layer answers first whenever its cache is warm:

  1. app-level file cache (api/platform_routes._idempotency_before/after,
     keyed by Idempotency-Key + sha256(body), TTL 24h): identical body ->
     cached response envelope verbatim; different body -> 409 CONFLICT.
  2. DB-level operation idempotency (services.service_operations.
     create_instance_and_deploy, keyed by project_id + idempotency_key +
     payload fingerprint): identical create -> the ORIGINAL operation row;
     different create -> 409 SERVICE_OPERATION_CONFLICT. It is observable by
     clearing the file cache between requests (cache miss / TTL expiry /
     multi-process deployments).

The file cache lives at DATA_DIR/idempotency.json in production. The test
redirects it into the isolated tmp data_dir (deterministic, never touches the
repository checkout).

* Auth/project-scope errors on the platform namespace carry the envelope:
    401 {error: {code: UNAUTHORIZED}},
    403 {error: {code: FORBIDDEN}} for a project outside the user's orgs.

app.py is deliberately NOT imported (it starts background schedulers at
module level, which would make the suite nondeterministic). The two seams
that normally pull app.py singletons are mirrored instead:
  * auth_routes._services   -> real UserService(data_dir) + stub role/access
  * projects_routes.load_projects -> the same config_db-backed implementation
    app.py delegates to (list_projects reads the real PostgreSQL rows seeded
    below).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import flask
import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

USERNAME = "cli-integration"
PASSWORD = "OldPassw0rd!x"
ORG = "org-cli-integration"
PROJECT = "proj-cli-integration"
FOREIGN_ORG = "org-cli-foreign"
FOREIGN_PROJECT = "proj-cli-foreign"
CATALOG_SLUG = "cli-contract-demo"
CATALOG_VERSION = "1.0.0"
IDEMPOTENCY_KEY = "cli-contract-deploy-1"


def _manifest() -> dict:
    """Minimal harmless catalog definition (same shape as the execution tests)."""
    return {
        "schema_version": 1,
        "slug": CATALOG_SLUG,
        "name": "CLI Contract Demo Service",
        "version": CATALOG_VERSION,
        "category": "web",
        "summary": "A harmless service used by the CLI/server contract tests",
        "runtime": "container",
        "image": "example/cli-contract-demo:1.0",
        "production_ready": False,
        "persistence": "stateless",
        "inputs": [
            {"name": "mode", "type": "enum", "choices": ["safe", "fast"], "default": "safe"},
        ],
        "secrets": [],
        "storage": [],
        "ports": [{"name": "http", "port": 8080, "public": True}],
        "endpoints": [{"name": "endpoint", "port": "http", "path": "/", "public": True}],
        "healthcheck": {"path": "/healthz", "port": 8080, "interval_seconds": 30},
        "lifecycle": {
            "start": True, "stop": True, "restart": True,
            "update": True, "rollback": True, "destroy": True,
        },
        "dependencies": [],
        "outputs": ["endpoint"],
        "supported_runtimes": ["docker"],
        "minimum_resources": {"cpu_millicores": 100, "memory_mb": 256, "storage_gb": 0},
    }


def _seed_org_project(org_id: str, project_id: str, user_id: str) -> None:
    from storage import pg

    now = time.time()
    pg.execute(
        "INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)",
        (org_id, org_id, user_id, now),
    )
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s,%s)",
        (project_id, org_id, user_id, project_id, "", now, now),
    )
    pg.execute(
        "INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",
        (org_id, user_id, "owner", now),
    )


@pytest.fixture
def idem_cache(data_dir):
    """Path of the app-level idempotency cache, inside the isolated data_dir."""
    return data_dir / "idempotency.json"


@pytest.fixture
def contract_client(data_dir, monkeypatch, idem_cache):
    """Flask test client with the full production blueprint set registered
    against real PostgreSQL test data and an isolated data_dir."""
    from api import register_blueprints
    from api import auth_routes as ar
    from api import platform_routes as platform
    from api import projects_routes as pr
    from auth.middleware import set_data_dir
    from services.login_security import _login_failures
    from services import service_catalog
    from services.user_service import UserService
    from storage import config_db

    # Redirect the app-level idempotency cache into the tmp data_dir: in
    # production it resolves through the app module's DATA_DIR; importing the
    # app module here would start background schedulers, so the path is
    # pinned explicitly (same file, same semantics, isolated location).
    monkeypatch.setattr(platform, "_idem_path", lambda: idem_cache)

    # Seed the login user (real credential store, isolated data_dir). The
    # org membership rows must reference the generated user id, not the
    # username, so login resolves the org context and scope filtering works.
    user = UserService(data_dir).create_user(USERNAME, PASSWORD, email="cli-integration@example.com")
    # Seed the user's org/project and a second org/project the user must NOT see.
    _seed_org_project(ORG, PROJECT, user.id)
    _seed_org_project(FOREIGN_ORG, FOREIGN_PROJECT, "foreign-owner")
    # Seed the catalog definition the mutation targets.
    service_catalog.publish_definition(_manifest(), USERNAME, None, scope="platform")

    class _Stub:
        def get_role_by_id(self, role_id):
            return None

        def get_user_permissions(self, user_id):
            return set()

    def fake_services():
        user_service = UserService(data_dir)
        return (user_service, _Stub(), _Stub(), data_dir)

    monkeypatch.setattr(ar, "_services", fake_services)
    # require_auth resolves DATA_DIR through the middleware module global.
    set_data_dir(data_dir)
    # Reset the in-memory brute-force window so suite ordering cannot trip it.
    _login_failures.clear()

    # Mirror app.py's load_projects without importing app.py (module level it
    # starts background schedulers). Same backing call, real PostgreSQL rows.
    def fake_load_projects(*, strict=False):
        return config_db.list_projects(data_dir)

    monkeypatch.setattr(pr, "load_projects", fake_load_projects)

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    register_blueprints(app)
    return app.test_client()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login(client):
    return client.post("/api/auth/login", json={"username": USERNAME, "password": PASSWORD})


def _deploy_payload(name: str) -> dict:
    return {
        "name": name,
        "environment": "development",
        "catalog_slug": CATALOG_SLUG,
        "catalog_version": CATALOG_VERSION,
        "runtime_id": "mock",
        "spec": {"mode": "safe"},
        "deploy": True,
    }


def _clear_idem_cache(idem_cache: Path) -> None:
    """Simulate an app-level cache miss (TTL expiry / cold process)."""
    idem_cache.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Full CLI flow: login -> read -> idempotent mutation (deploy create; the
# operation stays queued — no worker is needed or started).
# ---------------------------------------------------------------------------


def test_cli_flow_login_read_and_idempotent_mutation(contract_client, idem_cache):
    client = contract_client

    # 1. login: exact CLI-facing shape, org context attached.
    r = _login(client)
    assert r.status_code == 200
    body = r.get_json()
    assert body["success"] is True
    assert set(body) >= {"success", "access_token", "refresh_token", "orgs", "active_org_id", "user"}
    access = body["access_token"]
    assert isinstance(access, str) and access
    assert body["active_org_id"] == ORG
    assert [o["id"] for o in body["orgs"]] == [ORG]

    # 2. read: GET /api/projects lists the org-scoped project (legacy envelope
    # the CLI parses) and never leaks the foreign org's project.
    r = client.get("/api/projects", headers=_auth(access))
    assert r.status_code == 200
    body = r.get_json()
    assert body["success"] is True
    projects = body["projects"]
    mine = [p for p in projects if p["id"] == PROJECT]
    assert len(mine) == 1
    assert mine[0]["name"] == PROJECT
    assert mine[0]["orgId"] == ORG
    assert all(p["id"] != FOREIGN_PROJECT for p in projects)

    # 3. read on the platform namespace: envelope + X-Request-ID present.
    r = client.get(f"/api/projects/{PROJECT}/services", headers=_auth(access))
    assert r.status_code == 200
    body = r.get_json()
    assert body["data"]["services"] == []
    assert body["request_id"]
    assert r.headers.get("X-Request-ID") == body["request_id"]

    # 4. mutation: deploy create with an Idempotency-Key queues an operation
    # (202); nothing is executed because no worker claims it.
    payload = _deploy_payload("cli-contract-svc")
    headers = {**_auth(access), "Idempotency-Key": IDEMPOTENCY_KEY}
    r = client.post(f"/api/projects/{PROJECT}/services", json=payload, headers=headers)
    assert r.status_code == 202
    body = r.get_json()
    operation = body["operation"]
    assert operation["kind"] == "service.deploy"
    assert operation["status"] == "queued"
    assert operation["id"]
    assert operation["instance_id"]
    assert body["data"]["operation"] == operation
    assert body["request_id"]
    assert r.headers.get("X-Request-ID") == body["request_id"]
    operation_id = operation["id"]
    instance_id = operation["instance_id"]
    first_envelope = body

    # 5. idempotent replay (app-level cache warm): same key + identical body
    # returns the exact cached envelope — same operation, same request_id.
    r = client.post(f"/api/projects/{PROJECT}/services", json=payload, headers=headers)
    assert r.status_code == 202
    assert r.get_json() == first_envelope

    # 6. key reuse with a DIFFERENT body is rejected by the app-level layer.
    r = client.post(
        f"/api/projects/{PROJECT}/services",
        json=_deploy_payload("cli-contract-svc-other"),
        headers=headers,
    )
    assert r.status_code == 409
    body = r.get_json()
    assert body["error"]["code"] == "CONFLICT"
    assert body["request_id"]
    assert r.headers.get("X-Request-ID")

    # 7. cold cache: the DB-level operation idempotency replays the ORIGINAL
    # operation for an identical create request.
    _clear_idem_cache(idem_cache)
    r = client.post(f"/api/projects/{PROJECT}/services", json=payload, headers=headers)
    assert r.status_code == 202
    replayed = r.get_json()["operation"]
    assert replayed["id"] == operation_id
    assert replayed["instance_id"] == instance_id

    # 8. cold cache + key reuse with a different payload: the DB layer
    # rejects with the operation-level contract code.
    _clear_idem_cache(idem_cache)
    r = client.post(
        f"/api/projects/{PROJECT}/services",
        json=_deploy_payload("cli-contract-svc-other"),
        headers=headers,
    )
    assert r.status_code == 409
    assert r.get_json()["error"]["code"] == "SERVICE_OPERATION_CONFLICT"

    # 9. a deploy without an Idempotency-Key is a 400 with the contract code.
    r = client.post(
        f"/api/projects/{PROJECT}/services",
        json=_deploy_payload("cli-contract-svc-nokey"),
        headers=_auth(access),
    )
    assert r.status_code == 400
    assert r.get_json()["error"]["code"] == "SERVICE_VALIDATION_FAILED"


def test_cli_flow_draft_create_replay_returns_same_service(contract_client, idem_cache):
    """The 201 draft path (deploy absent) creates a service immediately, and a
    retry with the same Idempotency-Key + identical body returns the SAME
    service id — clients can retry draft creates safely."""
    client = contract_client
    access = _login(client).get_json()["access_token"]
    headers = {**_auth(access), "Idempotency-Key": "cli-contract-draft-1"}
    payload = {**_deploy_payload("cli-contract-draft"), "deploy": False}

    r = client.post(f"/api/projects/{PROJECT}/services", json=payload, headers=headers)
    assert r.status_code == 201
    body = r.get_json()
    service = body["data"]["service"]
    assert service["id"]
    assert body["request_id"]
    assert r.headers.get("X-Request-ID") == body["request_id"]
    first_envelope = body

    # Identical retry replays the cached 201 envelope: same service id.
    r = client.post(f"/api/projects/{PROJECT}/services", json=payload, headers=headers)
    assert r.status_code == 201
    assert r.get_json() == first_envelope

    # Cold cache: the name-uniqueness constraint rejects the duplicate with
    # the contract code (deterministic on every subsequent retry).
    _clear_idem_cache(idem_cache)
    r = client.post(f"/api/projects/{PROJECT}/services", json=payload, headers=headers)
    assert r.status_code == 409
    assert r.get_json()["error"]["code"] == "SERVICE_NAME_CONFLICT"


def test_cli_flow_rejects_bad_token_and_foreign_project(contract_client):
    """Auth and project-scope failures carry the platform error envelope."""
    client = contract_client

    # No token on the platform namespace -> 401 UNAUTHORIZED envelope.
    r = client.get(f"/api/projects/{PROJECT}/services")
    assert r.status_code == 401
    assert r.get_json()["error"]["code"] == "UNAUTHORIZED"
    assert r.headers.get("X-Request-ID")

    # Garbage token -> same contract code.
    r = client.get(f"/api/projects/{PROJECT}/services", headers=_auth("not-a-jwt"))
    assert r.status_code == 401
    assert r.get_json()["error"]["code"] == "UNAUTHORIZED"

    # A project outside the user's orgs -> 403 FORBIDDEN (no existence leak).
    access = _login(client).get_json()["access_token"]
    r = client.get(f"/api/projects/{FOREIGN_PROJECT}/services", headers=_auth(access))
    assert r.status_code == 403
    assert r.get_json()["error"]["code"] == "FORBIDDEN"
