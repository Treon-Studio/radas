"""Explicit v2 schemas for the shared client domains (Task 2.3, 2026-08-27 plan).

Covers the brief's required interfaces for auth/token, org/project, cloud
stack, flags, approvals, workers, services and ``GET /api/search``:

- The served ``/api/v2`` document carries explicit request/response schemas,
  stable operation IDs, BearerAuth security requirements, project/org scoping
  documentation and ``Idempotency-Key`` header parameters on mutating
  operations for these domains — replacing the generic auto-proxy rendering
  (no more "Proxy of v1" summaries or undocumented path parameters there).
- The generic auto-proxy is replaced ONLY for these domains: every replaced
  v1 path keeps full method coverage so the contract surface never shrinks.
- At HTTP level the real Flask app (mounted like production) serves the
  documented contracts: unauthenticated requests get the enveloped 401 and
  authenticated happy paths validate against the explicit schemas.
- Service operations emit their ``poll_url`` as the v1-relative URL from
  every namespace; the schema description documents that (runtime URLs are
  unchanged).
"""
from __future__ import annotations

import sys
import time
import types
from pathlib import Path

import pytest
from flask import Flask

from api.platform_contracts import REQUEST_ID_HEADER
from api.route_inventory import register_blueprints
from api_v2 import finalize_api_v2, init_api_v2
from api_v2.contract_checks import find_undocumented_required_parameters
from api_v2.schemas.contracts import (
    ErrorEnvelope,
    OperationEnvelope,
    SuccessEnvelope,
)

ORG = "shared-domain-org"
PROJECT = "shared-domain-project"
USER = "shared-domain-user"

ERROR_ENVELOPE_REF = "#/components/schemas/ErrorEnvelope"
SUCCESS_ENVELOPE_REF = "#/components/schemas/SuccessEnvelope"
OPERATION_ENVELOPE_REF = "#/components/schemas/OperationEnvelope"

_IDEMPOTENCY_MUTATIONS = (
    ("post", "/api/v2/auth/login"),
    ("post", "/api/v2/auth/refresh"),
    ("post", "/api/v2/auth/switch-org"),
    ("post", "/api/v2/orgs"),
    ("post", "/api/v2/projects"),
    ("post", "/api/v2/cloud/stacks"),
    ("put", "/api/v2/cloud/stacks/{name}"),
    ("delete", "/api/v2/cloud/stacks/{name}"),
    ("post", "/api/v2/cloud/stacks/{name}/actions"),
    ("post", "/api/v2/flags"),
    ("patch", "/api/v2/flags/{key}"),
    ("delete", "/api/v2/flags/{key}"),
    ("post", "/api/v2/flags/evaluate"),
    ("post", "/api/v2/approvals"),
    ("post", "/api/v2/approvals/{approval_id}/approve"),
    ("post", "/api/v2/approvals/{approval_id}/reject"),
    ("post", "/api/v2/admin/workers"),
    ("post", "/api/v2/worker/heartbeat"),
    ("post", "/api/v2/worker/claim"),
    ("post", "/api/v2/worker/executions/{execution_id}/finish"),
    ("post", "/api/v2/projects/{project_id}/services"),
    ("patch", "/api/v2/projects/{project_id}/services/{service_id}"),
)

_UNAUTHENTICATED_PROBES = (
    "/api/v2/auth/me",
    "/api/v2/orgs",
    "/api/v2/projects",
    "/api/v2/cloud/stacks",
    "/api/v2/flags",
    "/api/v2/approvals",
    "/api/v2/admin/workers",
    "/api/v2/search?q=stack",
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def domain_app():
    """App mounted exactly like production app.py (blueprints + cloud + v2)."""
    app = Flask(__name__)
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    from services.cloud_provisioning import register as _register_cloud

    _register_cloud(app)
    init_api_v2(app)
    finalize_api_v2(app)
    return app


@pytest.fixture(scope="module")
def v2spec(domain_app):
    response = domain_app.test_client().get("/api/v2/openapi.json")
    assert response.status_code == 200
    return response.get_json()


@pytest.fixture
def headers(data_dir):
    from auth.middleware import set_data_dir
    from auth.service import generate_token

    set_data_dir(data_dir)
    token = generate_token(USER, USER, [], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(data_dir):
    from auth.middleware import set_data_dir
    from auth.service import generate_token

    set_data_dir(data_dir)
    token = generate_token(USER, USER, ["admin"], data_dir, token_type="access")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def seeded_project(data_dir):
    """Org + org membership + project rows the scoped domains resolve against."""
    from storage import pg

    now = time.time()
    pg.execute(
        "INSERT INTO orgs (id,name,created_by,created_at) VALUES (%s,%s,%s,%s)",
        (ORG, ORG, USER, now),
    )
    pg.execute(
        "INSERT INTO org_members (org_id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",
        (ORG, USER, "owner", now),
    )
    pg.execute(
        "INSERT INTO projects (id,org_id,owner_id,name,description,is_archived,created_at,updated_at) "
        "VALUES (%s,%s,%s,%s,%s,0,%s,%s)",
        (PROJECT, ORG, USER, PROJECT, "", now, now),
    )
    return PROJECT


@pytest.fixture
def app_services(data_dir, monkeypatch):
    """Give the auth routes their UserService/RoleService singletons.

    The v1 handlers resolve them from the ``app`` module; tests inject a stub
    module wired to the isolated data dir instead of booting app.py.
    """
    from pathlib import Path as _Path

    from services.permission_service import AccessControlService
    from services.role_service import RoleService
    from services.user_service import UserService

    stub = types.ModuleType("app")
    stub.user_service = UserService(_Path(data_dir))
    stub.role_service = RoleService(_Path(data_dir))
    stub.access_control_service = AccessControlService(_Path(data_dir))
    stub.DATA_DIR = _Path(data_dir)
    monkeypatch.setitem(sys.modules, "app", stub)
    return stub


# ---------------------------------------------------------------------------
# Spec-level: explicit schemas replace the generic auto-proxy
# ---------------------------------------------------------------------------


def _operation(spec: dict, method: str, path: str) -> dict:
    operation = spec["paths"][path][method]
    assert "Proxy of v1" not in str(operation.get("summary", "")), (
        f"{method.upper()} {path} is still rendered by the generic auto-proxy"
    )
    return operation


def _assert_envelope_default_error(spec: dict, method: str, path: str) -> None:
    operation = _operation(spec, method, path)
    ref = operation["responses"]["default"]["content"]["application/json"]["schema"][
        "$ref"
    ]
    assert ref == ERROR_ENVELOPE_REF, f"{method.upper()} {path}: default error must be ErrorEnvelope"


def test_auth_domain_documents_explicit_schemas(v2spec):
    login = _operation(v2spec, "post", "/api/v2/auth/login")
    body = login["requestBody"]["content"]["application/json"]["schema"]
    assert "username" in body["properties"] and "password" in body["properties"]
    ok = login["responses"]["200"]["content"]["application/json"]["schema"]
    assert {"access_token", "refresh_token", "user"} <= set(ok["properties"])
    _assert_envelope_default_error(v2spec, "post", "/api/v2/auth/login")

    refresh = _operation(v2spec, "post", "/api/v2/auth/refresh")
    assert "refresh_token" in refresh["requestBody"]["content"]["application/json"][
        "schema"
    ]["properties"]
    _assert_envelope_default_error(v2spec, "post", "/api/v2/auth/refresh")

    me = _operation(v2spec, "get", "/api/v2/auth/me")
    assert me["security"] == [{"BearerAuth": []}]
    assert "user" in me["responses"]["200"]["content"]["application/json"]["schema"][
        "properties"
    ]
    _assert_envelope_default_error(v2spec, "get", "/api/v2/auth/me")


def test_org_project_domain_documents_explicit_schemas(v2spec):
    orgs_get = _operation(v2spec, "get", "/api/v2/orgs")
    assert "orgs" in orgs_get["responses"]["200"]["content"]["application/json"][
        "schema"
    ]["properties"]
    orgs_post = _operation(v2spec, "post", "/api/v2/orgs")
    assert "name" in orgs_post["requestBody"]["content"]["application/json"]["schema"][
        "properties"
    ]
    assert orgs_post["responses"]["201"]["description"]

    projects_get = _operation(v2spec, "get", "/api/v2/projects")
    assert "projects" in projects_get["responses"]["200"]["content"]["application/json"][
        "schema"
    ]["properties"]
    projects_post = _operation(v2spec, "post", "/api/v2/projects")
    assert "name" in projects_post["requestBody"]["content"]["application/json"][
        "schema"
    ]["properties"]

    switch = _operation(v2spec, "post", "/api/v2/auth/switch-org")
    assert "org_id" in switch["requestBody"]["content"]["application/json"]["schema"][
        "properties"
    ]
    assert switch["security"] == [{"BearerAuth": []}]


def test_cloud_stack_domain_documents_explicit_schemas(v2spec):
    stacks = _operation(v2spec, "get", "/api/v2/cloud/stacks")
    assert "stacks" in stacks["responses"]["200"]["content"]["application/json"][
        "schema"
    ]["properties"]
    create = _operation(v2spec, "post", "/api/v2/cloud/stacks")
    assert create["responses"]["201"]["description"]
    assert "name" in create["requestBody"]["content"]["application/json"]["schema"][
        "properties"
    ]

    for method in ("get", "put", "delete"):
        operation = _operation(v2spec, method, "/api/v2/cloud/stacks/{name}")
        params = {p["name"]: p for p in operation.get("parameters", [])}
        assert params["name"]["required"] is True
        assert params["name"]["in"] == "path"
        if method != "delete":
            _assert_envelope_default_error(
                v2spec, method, "/api/v2/cloud/stacks/{name}"
            )
    _assert_envelope_default_error(v2spec, "post", "/api/v2/cloud/stacks/{name}/actions")

    actions = _operation(v2spec, "post", "/api/v2/cloud/stacks/{name}/actions")
    assert "action" in actions["requestBody"]["content"]["application/json"]["schema"][
        "properties"
    ]


def test_flag_domain_documents_explicit_schemas(v2spec):
    listing = _operation(v2spec, "get", "/api/v2/flags")
    assert "flags" in listing["responses"]["200"]["content"]["application/json"][
        "schema"
    ]["properties"]
    create = _operation(v2spec, "post", "/api/v2/flags")
    assert create["responses"]["201"]["description"]
    assert "key" in create["requestBody"]["content"]["application/json"]["schema"][
        "properties"
    ]
    for method in ("patch", "delete"):
        operation = _operation(v2spec, method, "/api/v2/flags/{key}")
        params = {p["name"]: p for p in operation.get("parameters", [])}
        assert params["key"]["required"] is True
    evaluate = _operation(v2spec, "post", "/api/v2/flags/evaluate")
    assert "key" in evaluate["requestBody"]["content"]["application/json"]["schema"][
        "properties"
    ]


def test_approval_domain_documents_explicit_schemas(v2spec):
    listing = _operation(v2spec, "get", "/api/v2/approvals")
    assert "approvals" in listing["responses"]["200"]["content"]["application/json"][
        "schema"
    ]["properties"]
    create = _operation(v2spec, "post", "/api/v2/approvals")
    assert create["responses"]["201"]["description"]
    for method in ("approve", "reject"):
        operation = _operation(
            v2spec, "post", f"/api/v2/approvals/{{approval_id}}/{method}"
        )
        params = {p["name"]: p for p in operation.get("parameters", [])}
        assert params["approval_id"]["required"] is True
        _assert_envelope_default_error(
            v2spec, "post", f"/api/v2/approvals/{{approval_id}}/{method}"
        )


def test_worker_domain_documents_explicit_schemas(v2spec):
    workers = _operation(v2spec, "get", "/api/v2/admin/workers")
    assert "workers" in workers["responses"]["200"]["content"]["application/json"][
        "schema"
    ]["properties"]

    for path in (
        "/api/v2/worker/heartbeat",
        "/api/v2/worker/claim",
        "/api/v2/worker/executions/{execution_id}/finish",
    ):
        operation = _operation(v2spec, "post", path)
        assert operation["security"] == [{"BearerAuth": []}]
        _assert_envelope_default_error(v2spec, "post", path)

    claim = v2spec["paths"]["/api/v2/worker/claim"]["post"]
    assert "204" in claim["responses"], "empty claim (204) must stay documented"
    finish = _operation(v2spec, "post", "/api/v2/worker/executions/{execution_id}/finish")
    params = {p["name"]: p for p in finish.get("parameters", [])}
    assert params["execution_id"]["required"] is True


def test_service_domain_documents_envelope_contracts(v2spec):
    listing = _operation(v2spec, "get", "/api/v2/projects/{project_id}/services")
    ref = listing["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    assert ref == SUCCESS_ENVELOPE_REF
    assert listing["security"] == [{"BearerAuth": []}]

    create = _operation(v2spec, "post", "/api/v2/projects/{project_id}/services")
    assert create["responses"]["201"]["content"]["application/json"]["schema"][
        "$ref"
    ] == SUCCESS_ENVELOPE_REF
    assert create["responses"]["202"]["content"]["application/json"]["schema"][
        "$ref"
    ] == OPERATION_ENVELOPE_REF
    _assert_envelope_default_error(v2spec, "post", "/api/v2/projects/{project_id}/services")

    detail = _operation(v2spec, "get", "/api/v2/projects/{project_id}/services/{service_id}")
    params = {p["name"]: p for p in detail.get("parameters", [])}
    assert params["project_id"]["required"] is True
    assert params["service_id"]["required"] is True
    assert detail["responses"]["200"]["content"]["application/json"]["schema"][
        "$ref"
    ] == SUCCESS_ENVELOPE_REF

    operations = _operation(
        v2spec, "get", "/api/v2/projects/{project_id}/services/{service_id}/operations"
    )
    assert operations["responses"]["200"]["content"]["application/json"]["schema"][
        "$ref"
    ] == SUCCESS_ENVELOPE_REF
    patch = _operation(
        v2spec, "patch", "/api/v2/projects/{project_id}/services/{service_id}"
    )
    assert patch["responses"]["202"]["content"]["application/json"]["schema"][
        "$ref"
    ] == OPERATION_ENVELOPE_REF


def test_service_operations_document_v1_relative_poll_url(v2spec):
    """Task 2.2 minor: poll_url is a v1-relative URL from every namespace."""
    operation = v2spec["paths"][
        "/api/v2/projects/{project_id}/services/{service_id}/operations"
    ]["get"]
    description = str(operation["responses"]["200"])
    document = " ".join(
        str(value.get("description", ""))
        for value in v2spec["components"]["schemas"].values()
        if isinstance(value, dict)
    )
    combined = f"{description} {document}".lower()
    assert "poll_url" in combined
    assert "/api/projects/" in combined and "v1" in combined, (
        "service operation responses must document that poll_url is the "
        "v1-relative URL (runtime URLs are unchanged)"
    )


def test_mutating_domain_operations_document_idempotency_key(v2spec):
    for method, path in _IDEMPOTENCY_MUTATIONS:
        operation = v2spec["paths"][path][method]
        params = {p["name"]: p for p in operation.get("parameters", [])}
        idem = params.get("Idempotency-Key")
        assert idem is not None, f"{method.upper()} {path} misses Idempotency-Key"
        assert idem["in"] == "header"
        assert idem["required"] is False


def test_project_scoped_reads_document_project_header(v2spec):
    for method, path in (
        ("get", "/api/v2/cloud/stacks"),
        ("get", "/api/v2/approvals"),
        ("post", "/api/v2/approvals"),
    ):
        operation = v2spec["paths"][path][method]
        params = {p["name"] for p in operation.get("parameters", [])}
        assert "X-Project-Id" in params, (
            f"{method.upper()} {path} must document the X-Project-Id header"
        )


def test_search_domain_documents_get_and_post(v2spec):
    search_get = _operation(v2spec, "get", "/api/v2/search")
    params = {p["name"]: p for p in search_get.get("parameters", [])}
    assert params["q"]["required"] is True
    assert "limit" in params and "project_id" in params
    ok = search_get["responses"]["200"]["content"]["application/json"]["schema"]
    assert {"stacks", "runs", "playbooks", "secrets", "query"} <= set(ok["properties"])
    assert search_get["security"] == [{"BearerAuth": []}]
    # POST search keeps its explicit request schema (Task 2.2 era).
    assert "requestBody" in v2spec["paths"]["/api/v2/search"]["post"]


def test_replaced_domains_keep_full_method_coverage(v2spec):
    """The surface must not shrink: every replaced v1 path documents all methods."""
    expected = {
        "/api/v2/projects": {"get", "post"},
        "/api/v2/orgs": {"get", "post"},
        "/api/v2/cloud/stacks": {"get", "post"},
        "/api/v2/cloud/stacks/{name}": {"get", "put", "delete"},
        "/api/v2/flags": {"get", "post"},
        "/api/v2/flags/{key}": {"patch", "delete"},
        "/api/v2/approvals": {"get", "post"},
        "/api/v2/admin/workers": {"get", "post"},
        "/api/v2/projects/{project_id}/services": {"get", "post"},
        "/api/v2/projects/{project_id}/services/{service_id}": {"get", "patch"},
    }
    for path, methods in expected.items():
        assert path in v2spec["paths"], f"{path} disappeared from the v2 contract"
        documented = set(v2spec["paths"][path]) - {"parameters"}
        assert methods <= documented, f"{path}: missing {methods - documented}"


def test_delete_operations_document_runtime_response_shape(v2spec):
    """Review findings (Task 2.3): the two delete operations return tiny
    success bodies at runtime — ``{"success": true}`` for flags and
    ``{"ok": true}`` for stacks — so their documented 200 schemas must be the
    dedicated delete models, not the write-out shapes with required record
    fields (a generated client would fail on every successful delete)."""
    delete_flag = _operation(v2spec, "delete", "/api/v2/flags/{key}")
    flag_schema = delete_flag["responses"]["200"]["content"]["application/json"]["schema"]
    assert flag_schema["title"] == "FlagDeleteOut"
    assert "success" in flag_schema["properties"]
    assert "flag" not in flag_schema["properties"], (
        "DELETE flags documents a required 'flag' record the runtime never returns"
    )

    delete_stack = _operation(v2spec, "delete", "/api/v2/cloud/stacks/{name}")
    stack_schema = delete_stack["responses"]["200"]["content"]["application/json"]["schema"]
    assert stack_schema["title"] == "StackDeleteOut"
    assert "ok" in stack_schema["properties"]
    assert "name" not in stack_schema["properties"], (
        "DELETE stacks documents a required 'name' field the runtime never returns"
    )

    # The mutating neighbours keep the write-out shapes (regression guard:
    # only the two DELETE operations were re-documented).
    update_stack = _operation(v2spec, "put", "/api/v2/cloud/stacks/{name}")
    put_schema = update_stack["responses"]["200"]["content"]["application/json"]["schema"]
    assert put_schema["title"] == "StackWriteOut" and "name" in put_schema["required"]
    create_flag = _operation(v2spec, "post", "/api/v2/flags")
    create_schema = create_flag["responses"]["201"]["content"]["application/json"]["schema"]
    assert create_schema["title"] == "FlagWriteOut" and "flag" in create_schema["required"]


def test_delete_response_models_validate_exact_runtime_bodies():
    """The documented 200 models pin the EXACT runtime bodies produced by the
    delegated v1 handlers (api/feature_flag_routes.py ``{"success": True}``,
    services/cloud_provisioning.py ``{"ok": True}``)."""
    from api_v2.cloud_stack_routes import StackDeleteOut
    from api_v2.flag_routes import FlagDeleteOut

    flag_body = FlagDeleteOut.model_validate({"success": True})
    assert flag_body.success is True
    stack_body = StackDeleteOut.model_validate({"ok": True})
    assert stack_body.ok is True


# ---------------------------------------------------------------------------
# Contract-check refinement: explicit optional header params are legal
# ---------------------------------------------------------------------------


def test_contract_check_allows_explicit_optional_header_parameter():
    violations = find_undocumented_required_parameters(
        {
            "paths": {
                "/api/v2/x": {
                    "post": {
                        "parameters": [
                            {
                                "name": "Idempotency-Key",
                                "in": "header",
                                "required": False,
                                "schema": {"type": "string"},
                            }
                        ]
                    }
                }
            }
        }
    )
    assert violations == []


def test_contract_check_still_requires_path_parameter_required_true():
    violations = find_undocumented_required_parameters(
        {
            "paths": {
                "/api/v2/x/{name}": {
                    "get": {
                        "parameters": [
                            {"name": "name", "in": "path", "schema": {"type": "string"}}
                        ]
                    }
                }
            }
        }
    )
    assert len(violations) == 1 and "missing required=true" in violations[0]


# ---------------------------------------------------------------------------
# HTTP runtime: the served contract is true at runtime
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("path", _UNAUTHENTICATED_PROBES)
def test_unauthenticated_domain_reads_return_enveloped_401(domain_app, data_dir, path):
    from auth.middleware import set_data_dir

    set_data_dir(data_dir)
    response = domain_app.test_client().get(path)
    assert response.status_code == 401
    body = ErrorEnvelope().load(response.get_json())
    assert body["error"]["code"] == "UNAUTHORIZED"
    assert response.headers[REQUEST_ID_HEADER] == body["request_id"]


def test_auth_login_refresh_me_contract(domain_app, data_dir, app_services):
    app_services.user_service.create_user(USER, "contract-password-1", email=f"{USER}@example.com")
    client = domain_app.test_client()

    login = client.post(
        "/api/v2/auth/login",
        json={"username": USER, "password": "contract-password-1"},
    )
    assert login.status_code == 200
    from api_v2.auth_routes import LoginOut

    login_body = LoginOut.model_validate(login.get_json())
    assert login_body.access_token and login_body.refresh_token
    assert login_body.user.username == USER

    refresh = client.post(
        "/api/v2/auth/refresh", json={"refresh_token": login_body.refresh_token}
    )
    assert refresh.status_code == 200
    from api_v2.auth_routes import RefreshOut

    assert RefreshOut.model_validate(refresh.get_json()).access_token

    me = client.get("/api/v2/auth/me", headers={"Authorization": f"Bearer {login_body.access_token}"})
    assert me.status_code == 200
    from api_v2.auth_routes import MeOut

    me_body = MeOut.model_validate(me.get_json())
    assert me_body.user.username == USER
    assert REQUEST_ID_HEADER in me.headers

    bad_login = client.post(
        "/api/v2/auth/login", json={"username": USER, "password": "wrong"}
    )
    assert bad_login.status_code == 401
    ErrorEnvelope().load(bad_login.get_json())


def test_org_list_create_and_switch_org_contract(domain_app, data_dir, headers, seeded_project, app_services):
    client = domain_app.test_client()

    created = client.post("/api/v2/orgs", json={"name": "contract-org"}, headers=headers)
    assert created.status_code == 201
    from api_v2.org_project_routes import OrgCreateOut

    org = OrgCreateOut.model_validate(created.get_json())
    assert org.org["name"] == "contract-org"

    listing = client.get("/api/v2/orgs", headers=headers)
    assert listing.status_code == 200
    from api_v2.org_project_routes import OrgsOut

    orgs = OrgsOut.model_validate(listing.get_json())
    assert {item["id"] for item in orgs.orgs} >= {ORG, org.org["id"]}

    switched = client.post(
        "/api/v2/auth/switch-org", json={"org_id": ORG}, headers=headers
    )
    assert switched.status_code == 200
    from api_v2.org_project_routes import SwitchOrgOut

    switch = SwitchOrgOut.model_validate(switched.get_json())
    assert switch.active_org_id == ORG and switch.access_token

    denied = client.post("/api/v2/auth/switch-org", json={"org_id": "nope"}, headers=headers)
    assert denied.status_code == 403
    ErrorEnvelope().load(denied.get_json())


def test_project_list_and_create_contract(domain_app, data_dir, headers, seeded_project):
    client = domain_app.test_client()

    listing = client.get("/api/v2/projects", headers=headers)
    assert listing.status_code == 200
    from api_v2.org_project_routes import ProjectsOut

    projects = ProjectsOut.model_validate(listing.get_json())
    assert {item["id"] for item in projects.projects} == {PROJECT}

    created = client.post(
        "/api/v2/projects",
        json={"name": "contract-project", "org_id": ORG},
        headers=headers,
    )
    assert created.status_code == 200
    from api_v2.org_project_routes import ProjectWriteOut

    body = ProjectWriteOut.model_validate(created.get_json())
    assert body.project["name"] == "contract-project"
    assert body.project["org_id"] == ORG

    missing = client.post("/api/v2/projects", json={}, headers=headers)
    assert missing.status_code == 400
    ErrorEnvelope().load(missing.get_json())


def test_cloud_stack_list_get_and_actions_contract(domain_app, data_dir, headers, seeded_project):
    from services.cloud_provisioning import _envs_dir

    (_envs_dir(PROJECT) / "demo").mkdir(parents=True, exist_ok=True)
    (_envs_dir(PROJECT) / "demo" / "terraform.tfvars").write_text('env = "dev"\n', encoding="utf-8")
    client = domain_app.test_client()
    scoped = {**headers, "X-Project-Id": PROJECT}

    listing = client.get("/api/v2/cloud/stacks", headers=scoped)
    assert listing.status_code == 200
    from api_v2.cloud_stack_routes import StacksOut

    stacks = StacksOut.model_validate(listing.get_json())
    assert {item.name for item in stacks.stacks} == {'demo'}

    detail = client.get("/api/v2/cloud/stacks/demo", headers=scoped)
    assert detail.status_code == 200
    from api_v2.cloud_stack_routes import StackDetail

    stack = StackDetail.model_validate(detail.get_json())
    assert stack.name == "demo"

    locked = client.post(
        "/api/v2/cloud/stacks/demo/actions", json={"action": "lock", "reason": "contract"}, headers=scoped
    )
    assert locked.status_code == 200
    from api_v2.cloud_stack_routes import StackActionOut

    action = StackActionOut.model_validate(locked.get_json())
    assert action.ok is True

    unknown = client.get("/api/v2/cloud/stacks/nope", headers=scoped)
    assert unknown.status_code == 404
    ErrorEnvelope().load(unknown.get_json())


def test_stack_delete_success_body_contract(domain_app, data_dir, headers, seeded_project):
    """Review finding 2: DELETE /api/v2/cloud/stacks/{name} returns exactly
    ``{"ok": true}`` at runtime (PUT/POST return ``{"ok", "name"}`` — only
    DELETE differs) and the documented 200 model (StackDeleteOut) validates
    that body. HTTP-real: the stack working directory is seeded and the real
    v1 handler removes it."""
    from services.cloud_provisioning import _envs_dir

    (_envs_dir(PROJECT) / "doomed").mkdir(parents=True, exist_ok=True)
    (_envs_dir(PROJECT) / "doomed" / "terraform.tfvars").write_text(
        'env = "dev"\n', encoding="utf-8"
    )
    client = domain_app.test_client()
    scoped = {**headers, "X-Project-Id": PROJECT}

    deleted = client.delete("/api/v2/cloud/stacks/doomed", headers=scoped)
    assert deleted.status_code == 200
    assert deleted.get_json() == {"ok": True}, (
        "runtime stack delete body drifted from the documented StackDeleteOut shape"
    )
    from api_v2.cloud_stack_routes import StackDeleteOut

    assert StackDeleteOut.model_validate(deleted.get_json()).ok is True

    # Second delete: the working directory is gone → enveloped 404.
    gone = client.delete("/api/v2/cloud/stacks/doomed", headers=scoped)
    assert gone.status_code == 404
    ErrorEnvelope().load(gone.get_json())


def test_flags_list_create_update_evaluate_contract(domain_app, data_dir, admin_headers):
    client = domain_app.test_client()

    created = client.post(
        "/api/v2/flags",
        json={"key": "contract.flag", "name": "Contract flag", "enabled": True},
        headers=admin_headers,
    )
    assert created.status_code == 201
    from api_v2.flag_routes import FlagWriteOut

    flag = FlagWriteOut.model_validate(created.get_json())
    assert flag.flag.key == 'contract.flag'

    listing = client.get("/api/v2/flags", headers=admin_headers)
    assert listing.status_code == 200
    from api_v2.flag_routes import FlagsOut

    flags = FlagsOut.model_validate(listing.get_json())
    assert 'contract.flag' in {item.key for item in flags.flags}

    updated = client.patch(
        "/api/v2/flags/contract.flag",
        json={"enabled": False},
        headers=admin_headers,
    )
    assert updated.status_code == 200
    assert FlagWriteOut.model_validate(updated.get_json()).flag.enabled is False

    evaluated = client.post(
        "/api/v2/flags/evaluate", json={"key": "contract.flag"}, headers=admin_headers
    )
    assert evaluated.status_code == 200
    from api_v2.flag_routes import FlagEvaluateOut

    assert FlagEvaluateOut.model_validate(evaluated.get_json()).key == "contract.flag"

    denied = client.post("/api/v2/flags", json={"key": "x.flag"}, headers={})
    assert denied.status_code == 401
    ErrorEnvelope().load(denied.get_json())


def test_flag_delete_success_body_contract(domain_app, data_dir, admin_headers):
    """Review finding 1: DELETE /api/v2/flags/{key} returns exactly
    ``{"success": true}`` at runtime (no flag record) and the documented 200
    model (FlagDeleteOut) validates that body.

    HTTP-real: the permanent-delete success path requires an archived flag,
    so this walks the real flow (create → delete → 409 → archive → delete →
    200) through the mounted v1+v2 routes.
    """
    client = domain_app.test_client()

    created = client.post(
        "/api/v2/flags",
        json={"key": "contract.delete.flag", "name": "Delete me"},
        headers=admin_headers,
    )
    assert created.status_code == 201

    # Not archived yet: the runtime refuses permanent deletion with a 409
    # error envelope (documented as the default error response).
    blocked = client.delete(
        "/api/v2/flags/contract.delete.flag", headers=admin_headers
    )
    assert blocked.status_code == 409
    ErrorEnvelope().load(blocked.get_json())

    archived = client.post(
        "/api/flags/contract.delete.flag/archive",
        json={"reason": "contract test"},
        headers=admin_headers,
    )
    assert archived.status_code == 200

    deleted = client.delete(
        "/api/v2/flags/contract.delete.flag", headers=admin_headers
    )
    assert deleted.status_code == 200
    assert deleted.get_json() == {"success": True}, (
        "runtime delete body drifted from the documented FlagDeleteOut shape"
    )
    from api_v2.flag_routes import FlagDeleteOut

    assert FlagDeleteOut.model_validate(deleted.get_json()).success is True


def test_approvals_list_and_approve_contract(domain_app, data_dir, headers, seeded_project):
    from services.approval_service import create_approval

    record = create_approval("demo", PROJECT, "plan", requested_by=USER)
    client = domain_app.test_client()
    scoped = {**headers, "X-Project-Id": PROJECT}

    listing = client.get("/api/v2/approvals", headers=scoped)
    assert listing.status_code == 200
    from api_v2.approval_routes import ApprovalsOut

    approvals = ApprovalsOut.model_validate(listing.get_json())
    assert record['id'] in {item.id for item in approvals.approvals}

    approved = client.post(
        f"/api/v2/approvals/{record['id']}/approve", headers=scoped
    )
    assert approved.status_code == 200
    from api_v2.approval_routes import ApprovalWriteOut

    body = ApprovalWriteOut.model_validate(approved.get_json())
    assert body.approval.status == 'approved'

    unknown = client.post("/api/v2/approvals/does-not-exist/reject", headers=scoped)
    # NOTE: the v1 reject handler raises ValueError("rejection reason is
    # mandatory") before the record lookup — a pre-existing runtime bug that
    # is outside Task 2.3's scope. The documented default error envelope is
    # exactly what the runtime produces here.
    assert unknown.status_code == 500
    error = ErrorEnvelope().load(unknown.get_json())
    assert error["error"]["code"] == "INTERNAL_SERVER_ERROR"


def test_workers_list_heartbeat_and_claim_contract(
    domain_app, data_dir, workers_env, headers, monkeypatch
):
    import api.worker_routes as v1_workers

    worker_id, worker_token = workers_env.create_worker(name="contract-worker")
    client = domain_app.test_client()

    listing = client.get("/api/v2/admin/workers", headers=headers)
    assert listing.status_code == 200
    from api_v2.worker_routes import WorkersOut

    workers = WorkersOut.model_validate(listing.get_json())
    assert worker_id in {item.id for item in workers.workers}

    beat = client.post(
        "/api/v2/worker/heartbeat",
        json={"currentExecutionId": None},
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    assert beat.status_code == 200
    from api_v2.worker_routes import HeartbeatOut

    beat_body = HeartbeatOut.model_validate(beat.get_json())
    assert beat_body.workerId == worker_id
    assert beat_body.requestSystemInfo is False

    monkeypatch.setattr(
        v1_workers,
        "_app_module",
        lambda: types.SimpleNamespace(
            server_claim_next_execution=lambda **kwargs: (None, None, None)
        ),
    )
    v1_workers._claim_rate_limits.clear()
    claim = client.post(
        "/api/v2/worker/claim", json={}, headers={"Authorization": f"Bearer {worker_token}"}
    )
    assert claim.status_code == 204

    finish = client.post(
        f"/api/v2/worker/executions/{worker_id}/finish",
        json={"status": "SUCCESS"},
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    assert finish.status_code == 404
    ErrorEnvelope().load(finish.get_json())


def test_worker_heartbeat_rejects_invalid_token(domain_app, data_dir, workers_env):
    from auth.middleware import set_data_dir

    set_data_dir(data_dir)
    response = domain_app.test_client().post(
        "/api/v2/worker/heartbeat", json={}, headers={"Authorization": "Bearer bogus"}
    )
    assert response.status_code == 401
    ErrorEnvelope().load(response.get_json())


def test_worker_claim_rejects_user_jwt(domain_app, data_dir, headers):
    """Review minor 3: ``/api/v2/worker/*`` is worker-token-only (the
    middleware verifies a worker-registry token and returns 401 before the
    user-JWT branch ever runs) — a normal user access token must be rejected
    with the enveloped 401.

    POST /worker/claim is the probe because every ``/api/v2/worker/*``
    operation is POST-only; a GET would fail with 405 before the
    ``require_auth`` decorator executes.
    """
    from auth.middleware import set_data_dir

    set_data_dir(data_dir)
    response = domain_app.test_client().post(
        "/api/v2/worker/claim", json={}, headers=headers
    )
    assert response.status_code == 401
    error = ErrorEnvelope().load(response.get_json())
    assert error["error"]["code"] == "UNAUTHORIZED"


def test_services_list_get_create_operations_contract(
    domain_app, data_dir, headers, seeded_project, monkeypatch
):
    from services import service_catalog

    service_catalog.publish_definition(
        {
            "schema_version": 1,
            "slug": "shared-demo",
            "name": "Shared Demo Service",
            "version": "1.0.0",
            "category": "web",
            "summary": "A harmless service used by shared-domain tests",
            "runtime": "container",
            "image": "example/shared-demo:1.2.3",
            "production_ready": False,
            "persistence": "stateless",
            "inputs": [
                {"name": "memory_mb", "type": "integer", "default": 256, "min": 128, "max": 4096},
                {"name": "mode", "type": "enum", "choices": ["safe", "fast"], "default": "safe"},
                {"name": "enabled", "type": "boolean", "default": False},
            ],
            "secrets": [{"name": "admin_password", "required": False}],
            "storage": [],
            "ports": [{"name": "http", "port": 8080, "public": True}],
            "endpoints": [{"name": "endpoint", "port": "http", "path": "/", "public": True}],
            "healthcheck": {"path": "/healthz", "port": 8080, "interval_seconds": 30},
            "lifecycle": {"start": True, "stop": True, "restart": True, "update": True, "rollback": True, "destroy": True},
            "dependencies": [],
            "outputs": ["endpoint"],
            "supported_runtimes": ["docker"],
            "minimum_resources": {"cpu_millicores": 100, "memory_mb": 256, "storage_gb": 0},
        },
        USER,
        None,
        scope="platform",
    )
    client = domain_app.test_client()
    base = f"/api/v2/projects/{PROJECT}/services"

    listing = client.get(base, headers=headers)
    assert listing.status_code == 200
    body = SuccessEnvelope().load(listing.get_json())
    assert body["data"] == {"services": [], "org_id": ORG}

    created = client.post(
        base,
        json={
            "name": "shared-demo-1",
            "environment": "development",
            "catalog_slug": "shared-demo",
            "catalog_version": "1.0.0",
            "runtime_id": "mock",
            "spec": {"mode": "safe"},
        },
        headers=headers,
    )
    assert created.status_code == 201, created.get_json()
    created_body = SuccessEnvelope().load(created.get_json())
    assert created_body["data"]["service"]["name"] == "shared-demo-1"
    service_id = created_body["data"]["service"]["id"]

    detail = client.get(f"{base}/{service_id}", headers=headers)
    assert detail.status_code == 200
    SuccessEnvelope().load(detail.get_json())

    operations = client.get(f"{base}/{service_id}/operations", headers=headers)
    assert operations.status_code == 200
    operations_body = SuccessEnvelope().load(operations.get_json())
    assert operations_body["data"]["operations"] == []

    missing = client.get(f"{base}/does-not-exist", headers=headers)
    assert missing.status_code == 404
    error = ErrorEnvelope().load(missing.get_json())
    assert error["error"]["code"] == "SERVICE_NOT_FOUND"


def test_search_get_contract(domain_app, data_dir, headers, seeded_project):
    from storage import pg

    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s,%s,%s) "
        "ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data",
        (PROJECT, "contract-stack", '{"env": "dev"}'),
    )
    response = domain_app.test_client().get(
        "/api/v2/search?q=contract", headers={**headers, "X-Project-Id": PROJECT}
    )
    assert response.status_code == 200
    from api_v2.queue_search_routes import SearchGETOut

    body = SearchGETOut.model_validate(response.get_json())
    assert body.query == "contract"
    assert body.total_matches >= 1
    assert any(item.name == 'contract-stack' for item in body.stacks)

    short = domain_app.test_client().get("/api/v2/search?q=c", headers=headers)
    assert short.status_code == 400
    ErrorEnvelope().load(short.get_json())
