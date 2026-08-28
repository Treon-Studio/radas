"""Shared envelope + schema contracts for ``/api/v2`` (Task 2.2, 2026-08-27 plan).

Covers the brief's required interfaces:

- Success envelope: ``{"data": ..., "request_id": ...}``
- Structured error envelope: ``{"error": {"code", "message", "details"}, "request_id": ...}``
- Async operation envelope: ``{"operation": {"id", "status", ...}, "request_id": ...}``
- Pagination metadata stays a stable, documented schema in the served document.
- Validation errors surface as ``VALIDATION_ERROR`` with machine-readable details.
- Redaction policy: ``error.details`` (and every envelope body) must never carry
  credential material; retryability may appear only as a boolean or a category
  token, never as internal exception text.
- The served ``/api/v2`` document defines the shared schemas in
  ``components/schemas`` and the platform envelope operations reference them
  via ``$ref``.
- At HTTP level, real test-client requests to annotated v2 operations return
  bodies that round-trip validate against those schemas, with X-Request-ID
  correlation — the served contract is true at runtime.
- Legacy ``/api/*`` payloads and documents stay untouched.
"""
from __future__ import annotations

import pytest
from flask import Flask

from api.route_inventory import register_blueprints
from api.platform_contracts import (
    REQUEST_ID_HEADER,
    RETRYABLE_ERROR_CODES,
    error_envelope,
    is_retryable,
    operation_envelope,
    success_envelope,
)
from api_v2 import finalize_api_v2, init_api_v2


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def contract_app():
    """App mounted exactly like production app.py (blueprints + cloud + v2)."""
    app = Flask(__name__)
    app.config.update(TESTING=True)
    register_blueprints(app)
    from services.cloud_provisioning import register as _register_cloud

    _register_cloud(app)
    init_api_v2(app)
    finalize_api_v2(app)
    return app


@pytest.fixture(scope="module")
def v2_spec(contract_app):
    response = contract_app.test_client().get("/api/v2/openapi.json")
    assert response.status_code == 200
    return response.get_json()


@pytest.fixture
def request_context(contract_app):
    with contract_app.test_request_context("/api/platform/envelopes"):
        yield


# ---------------------------------------------------------------------------
# Success envelope
# ---------------------------------------------------------------------------


def test_success_envelope_shape(request_context):
    body = success_envelope({"value": 42}, request_id_value="req-1")
    assert body == {"data": {"value": 42}, "request_id": "req-1"}
    assert set(body) == {"data", "request_id"}


def test_success_envelope_generates_request_id(request_context):
    body = success_envelope({"ok": True})
    assert set(body) == {"data", "request_id"}
    assert body["request_id"]


def test_success_envelope_allows_none_data(request_context):
    body = success_envelope(None)
    assert body["data"] is None
    assert set(body) == {"data", "request_id"}


# ---------------------------------------------------------------------------
# Structured error envelope
# ---------------------------------------------------------------------------


def test_error_envelope_shape(request_context):
    body = error_envelope("NOT_FOUND", "Service definition not found")
    assert body == {
        "error": {"code": "NOT_FOUND", "message": "Service definition not found", "details": {}},
        "request_id": body["request_id"],
    }
    assert set(body) == {"error", "request_id"}
    assert set(body["error"]) == {"code", "message", "details"}


def test_error_envelope_includes_machine_readable_details(request_context):
    body = error_envelope(
        "VALIDATION_ERROR",
        "Service definition manifest is invalid",
        details={"errors": ["manifest.title: required"]},
    )
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["details"] == {"errors": ["manifest.title: required"]}


def test_validation_error_uses_validation_error_code(request_context):
    body = error_envelope("VALIDATION_ERROR", "JSON object required")
    assert body["error"]["code"] == "VALIDATION_ERROR"


# ---------------------------------------------------------------------------
# Async operation envelope
# ---------------------------------------------------------------------------


def test_operation_envelope_shape(request_context):
    operation = {
        "id": "op-123",
        "kind": "service.deploy",
        "status": "queued",
        "poll_url": "/api/platform/operations/op-123",
    }
    body = operation_envelope(operation, request_id_value="op-req-1")
    assert body["operation"] == operation
    assert body["request_id"] == "op-req-1"
    assert set(body) == {"operation", "data", "request_id"}
    # Compatibility alias for older console clients mirrors the operation.
    assert body["data"] == {"operation": operation}


def test_operation_envelope_requires_contract_fields():
    with pytest.raises(ValueError, match="poll_url"):
        operation_envelope({"id": "op-1", "kind": "service.deploy", "status": "queued"})


def test_operation_envelope_redacts_credentials(request_context):
    body = operation_envelope(
        {
            "id": "op-1",
            "kind": "service.deploy",
            "status": "queued",
            "poll_url": "/api/platform/operations/op-1",
            "api_key": "raw-key",
        }
    )
    assert body["operation"]["api_key"] == "[REDACTED]"


# ---------------------------------------------------------------------------
# Redaction policy: error.details must never carry credential material
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "details",
    [
        {"password": "raw-password"},
        {"api_key": "raw-key"},
        {"authorization": "Bearer raw-bearer"},
        {"nested": {"client_secret": "raw-client"}},
        {"list": [{"AWS_SECRET_ACCESS_KEY": "raw-aws"}]},
    ],
)
def test_error_details_never_carry_credential_material(request_context, details):
    body = error_envelope("BAD_REQUEST", "request failed", details=details)
    flattened = repr(body["error"]["details"])
    assert "raw-" not in flattened
    assert "[REDACTED]" in flattened


def test_error_message_redacts_inline_credentials(request_context):
    body = error_envelope(
        "CONFLICT",
        "cannot use access_token=raw-token Bearer raw-bearer",
    )
    assert "raw-token" not in body["error"]["message"]
    assert "raw-bearer" not in body["error"]["message"]


# ---------------------------------------------------------------------------
# Retryability: boolean/category only, never exception text
# ---------------------------------------------------------------------------


def test_retryability_is_boolean_classification():
    assert isinstance(RETRYABLE_ERROR_CODES, frozenset)
    assert "RATE_LIMITED" in RETRYABLE_ERROR_CODES
    assert "VALIDATION_ERROR" not in RETRYABLE_ERROR_CODES
    for code in (
        "BAD_REQUEST",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NOT_FOUND",
        "METHOD_NOT_ALLOWED",
        "CONFLICT",
        "VALIDATION_ERROR",
        "RATE_LIMITED",
        "INTERNAL_SERVER_ERROR",
    ):
        result = is_retryable(code)
        assert isinstance(result, bool)
        assert result == (code in RETRYABLE_ERROR_CODES)


def test_retryable_details_expose_boolean_not_exception_text(request_context):
    body = error_envelope(
        "RATE_LIMITED",
        "slow down",
        details={"retryable": True, "retry_category": "rate_limited"},
    )
    assert body["error"]["details"]["retryable"] is True
    assert body["error"]["details"]["retry_category"] == "rate_limited"
    # No free-form exception narrative anywhere in the body.
    assert set(body["error"]["details"]) <= {"retryable", "retry_category"}


# ---------------------------------------------------------------------------
# Served /api/v2 document: shared schemas defined and referenced
# ---------------------------------------------------------------------------

SHARED_ENVELOPE_SCHEMAS = (
    "SuccessEnvelope",
    "ErrorBody",
    "ErrorEnvelope",
    "Operation",
    "OperationEnvelope",
)

REDACTION_POLICY_MARKERS = ("[REDACTED]", "credential")


def test_v2_document_defines_shared_envelope_schemas(v2_spec):
    schemas = v2_spec["components"]["schemas"]
    missing = set(SHARED_ENVELOPE_SCHEMAS) - set(schemas)
    assert not missing, f"shared envelope schemas missing: {sorted(missing)}"
    # Pre-existing required schemas stay defined.
    assert {"Error", "PaginationMetadata"} <= set(schemas)


def test_success_envelope_schema_requires_data_and_request_id(v2_spec):
    schema = v2_spec["components"]["schemas"]["SuccessEnvelope"]
    assert sorted(schema.get("required", [])) == ["data", "request_id"]
    assert set(schema["properties"]) == {"data", "request_id"}
    assert schema["properties"]["request_id"].get("description")


def test_error_envelope_schema_references_error_body_and_documents_policy(v2_spec):
    schemas = v2_spec["components"]["schemas"]
    envelope = schemas["ErrorEnvelope"]
    assert envelope["properties"]["error"]["$ref"] == "#/components/schemas/ErrorBody"
    error_body = schemas["ErrorBody"]
    assert sorted(error_body["properties"]) == ["code", "details", "message"]
    described = " ".join(
        str(prop.get("description", "")) for prop in error_body["properties"].values()
    )
    for marker in REDACTION_POLICY_MARKERS:
        assert marker in described, "redaction policy must appear in schema descriptions"
    assert "[REDACTED]" in " ".join(
        str(prop.get("description", ""))
        for prop in schemas["ErrorEnvelope"]["properties"].values()
    ) or "[REDACTED]" in described


def test_operation_envelope_schema_requires_operation_and_request_id(v2_spec):
    schemas = v2_spec["components"]["schemas"]
    operation = schemas["Operation"]
    assert sorted(operation.get("required", [])) == ["id", "kind", "poll_url", "status"]
    envelope = schemas["OperationEnvelope"]
    assert (
        envelope["properties"]["operation"]["$ref"] == "#/components/schemas/Operation"
    )
    assert "request_id" in envelope["properties"]


def test_error_envelope_schema_documents_retryability_as_boolean_or_category(v2_spec):
    details_schema = v2_spec["components"]["schemas"]["ErrorBody"]["properties"]["details"]
    description = str(details_schema.get("description", ""))
    assert "retryab" in description.lower()
    assert "boolean" in description.lower()


# ---------------------------------------------------------------------------
# Platform envelope operations reference the shared schemas
# ---------------------------------------------------------------------------

_PLATFORM_ENVELOPE_OPERATIONS = {
    ("get", "/api/v2/platform/catalog"): ("200", "SuccessEnvelope"),
    ("get", "/api/v2/platform/catalog/{slug}"): ("200", "SuccessEnvelope"),
    ("post", "/api/v2/platform/catalog"): ("201", "SuccessEnvelope"),
    ("post", "/api/v2/platform/catalog/{slug}/{version}/deprecate"): ("200", "SuccessEnvelope"),
    (
        "post",
        "/api/v2/projects/{project_id}/services/{service_id}/source/deploy",
    ): ("202", "OperationEnvelope"),
}


def test_platform_envelope_operations_reference_shared_schemas(v2_spec):
    for (method, path), (status, schema_name) in _PLATFORM_ENVELOPE_OPERATIONS.items():
        operation = v2_spec["paths"][path][method]
        response = operation["responses"][status]
        ref = response["content"]["application/json"]["schema"]["$ref"]
        assert ref == f"#/components/schemas/{schema_name}", (
            f"{method.upper()} {path}: expected {schema_name}, got {ref}"
        )


def test_platform_envelope_operations_use_structured_error_envelope(v2_spec):
    paths = [
        "/api/v2/platform/catalog",
        "/api/v2/platform/catalog/{slug}",
        "/api/v2/platform/catalog/{slug}/{version}/deprecate",
    ]
    for path in paths:
        for method, operation in v2_spec["paths"][path].items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            ref = operation["responses"]["default"]["content"]["application/json"][
                "schema"
            ]["$ref"]
            assert ref == "#/components/schemas/ErrorEnvelope", (
                f"{method.upper()} {path}: default error must reference ErrorEnvelope"
            )


def test_legacy_platform_idempotency_path_is_not_enveloped(v2_spec):
    operation = v2_spec["paths"]["/api/v2/platform/idempotency"]["get"]
    responses = operation["responses"]
    refs = [
        (code, response.get("content", {}).get("application/json", {}).get("schema", {}).get("$ref"))
        for code, response in responses.items()
    ]
    for _code, ref in refs:
        assert ref not in {
            "#/components/schemas/SuccessEnvelope",
            "#/components/schemas/ErrorEnvelope",
            "#/components/schemas/OperationEnvelope",
        }


# ---------------------------------------------------------------------------
# Pagination metadata stays stable
# ---------------------------------------------------------------------------


def test_pagination_metadata_schema_is_stable(v2_spec):
    schema = v2_spec["components"]["schemas"]["PaginationMetadata"]
    assert schema["type"] == "object"
    assert sorted(schema["properties"]) == [
        "first_page",
        "last_page",
        "next_page",
        "page",
        "previous_page",
        "total",
        "total_pages",
    ]
    assert all(prop["type"] == "integer" for prop in schema["properties"].values())


# ---------------------------------------------------------------------------
# Runtime envelopes validate against the served schemas
# ---------------------------------------------------------------------------


def test_runtime_envelopes_validate_against_contract_schemas(request_context):
    from api_v2.schemas.contracts import ErrorEnvelope, OperationEnvelope, SuccessEnvelope

    success = SuccessEnvelope().load(
        success_envelope({"value": 42}, request_id_value="req-1")
    )
    assert success["request_id"] == "req-1"

    error = ErrorEnvelope().load(
        error_envelope("VALIDATION_ERROR", "bad input", details={"errors": ["x"]})
    )
    assert error["error"]["code"] == "VALIDATION_ERROR"

    operation = OperationEnvelope().load(
        operation_envelope(
            {
                "id": "op-1",
                "kind": "service.deploy",
                "status": "queued",
                "poll_url": "/api/platform/operations/op-1",
            }
        )
    )
    assert operation["operation"]["status"] == "queued"


def test_contract_schemas_reject_envelopes_missing_request_id():
    from marshmallow import ValidationError as MarshmallowValidationError

    from api_v2.schemas.contracts import SuccessEnvelope

    with pytest.raises(MarshmallowValidationError):
        SuccessEnvelope().load({"data": {}})


# ---------------------------------------------------------------------------
# Runtime-vs-contract: real HTTP requests against an annotated v2 operation
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def http_contract_app():
    """Full production-shape app (blueprints + cloud + v2) for HTTP probes.

    Unlike :func:`contract_app` this also enables realistic error handling so
    real test-client requests exercise the app-level contract finalizer the
    way production does. Auth/pg state is isolated per test (``data_dir``).
    """
    app = Flask(__name__)
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    from services.cloud_provisioning import register as _register_cloud

    _register_cloud(app)
    init_api_v2(app)
    finalize_api_v2(app)
    return app


def test_unauthenticated_v2_operation_returns_served_error_envelope(
    http_contract_app, data_dir
):
    """The served document claims ``default → ErrorEnvelope`` on this operation.

    At HTTP level the legacy middleware shape (``{"error": "Authentication
    required", ...}``) must be normalized into the ErrorEnvelope contract and
    correlated via the X-Request-ID response header.
    """
    from auth import middleware
    from api_v2.schemas.contracts import ErrorEnvelope

    middleware.set_data_dir(data_dir)
    client = http_contract_app.test_client()

    response = client.get("/api/v2/platform/catalog")
    assert response.status_code == 401
    error_body = ErrorEnvelope().load(response.get_json())
    assert error_body["error"]["code"] == "UNAUTHORIZED"
    assert error_body["error"]["message"] == "Access token missing"
    assert response.headers[REQUEST_ID_HEADER] == error_body["request_id"]

    # A well-formed client-supplied X-Request-ID is reused on v2 responses.
    echoed = client.get(
        "/api/v2/platform/catalog", headers={REQUEST_ID_HEADER: "probe-echo-123"}
    )
    assert echoed.status_code == 401
    assert echoed.headers[REQUEST_ID_HEADER] == "probe-echo-123"
    assert ErrorEnvelope().load(echoed.get_json())["request_id"] == "probe-echo-123"


def test_authenticated_v2_operation_returns_served_success_envelope(
    http_contract_app, data_dir
):
    """With a valid token the annotated operation serves SuccessEnvelope."""
    from auth import middleware
    from api_v2.schemas.contracts import SuccessEnvelope
    from auth.service import generate_token
    from services import service_catalog

    middleware.set_data_dir(data_dir)
    service_catalog.seed_recommended_definitions()
    token = generate_token(
        "u1", "contract-user", ["member"], data_dir, token_type="access"
    )
    response = http_contract_app.test_client().get(
        "/api/v2/platform/catalog", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    success_body = SuccessEnvelope().load(response.get_json())
    assert set(success_body["data"]) == {"definitions"}
    assert response.headers[REQUEST_ID_HEADER] == success_body["request_id"]


def test_legacy_paths_stay_outside_contract_at_http_level(
    http_contract_app, data_dir, monkeypatch
):
    """Legacy error shapes stay byte-identical: no envelope, no request ID."""
    import api.platform_routes as platform_routes
    from auth import middleware

    middleware.set_data_dir(data_dir)
    # The idempotency status route reads a shared store; isolate it so the
    # assertion does not depend on ambient entries from other runs.
    monkeypatch.setattr(
        platform_routes, "_idem_path", lambda: data_dir / "idempotency.json"
    )
    client = http_contract_app.test_client()

    legacy = client.get("/api/projects/p1/environments")
    assert legacy.status_code == 401
    assert legacy.get_json() == {
        "error": "Authentication required",
        "message": "Access token missing",
    }
    assert REQUEST_ID_HEADER not in legacy.headers

    mirror = client.get("/api/v2/platform/idempotency")
    assert mirror.status_code == 200
    assert mirror.get_json() == {"entries": 0}
    assert REQUEST_ID_HEADER not in mirror.headers


# ---------------------------------------------------------------------------
# Legacy surface stays untouched
# ---------------------------------------------------------------------------


def test_legacy_openapi_document_is_not_absorbing_envelope_contracts(contract_app):
    from openapi.spec import get_openapi_spec

    legacy = get_openapi_spec("http://localhost:5000")
    assert legacy["info"]["version"] == "v1"
    assert not [p for p in legacy["paths"] if p.startswith("/api/v2")]
    legacy_schema_names = set(legacy.get("components", {}).get("schemas", {}))
    assert not legacy_schema_names & set(SHARED_ENVELOPE_SCHEMAS)
