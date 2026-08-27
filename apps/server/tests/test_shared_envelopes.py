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
- Legacy ``/api/*`` payloads and documents stay untouched.
"""
from __future__ import annotations

import pytest
from flask import Flask

from api.route_inventory import register_blueprints
from api.platform_contracts import (
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
# Legacy surface stays untouched
# ---------------------------------------------------------------------------


def test_legacy_openapi_document_is_not_absorbing_envelope_contracts(contract_app):
    from openapi.spec import get_openapi_spec

    legacy = get_openapi_spec("http://localhost:5000")
    assert legacy["info"]["version"] == "v1"
    assert not [p for p in legacy["paths"] if p.startswith("/api/v2")]
    legacy_schema_names = set(legacy.get("components", {}).get("schemas", {}))
    assert not legacy_schema_names & set(SHARED_ENVELOPE_SCHEMAS)
