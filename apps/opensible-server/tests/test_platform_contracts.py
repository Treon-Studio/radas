"""Tests for the additive platform API response contracts."""
from __future__ import annotations

import pytest
from flask import Flask, abort

from api.platform_contracts import (
    REQUEST_ID_HEADER,
    error_response,
    operation_envelope,
    operation_response,
    redact_sensitive,
    register_platform_contracts,
    success_response,
)


@pytest.fixture
def app() -> Flask:
    app = Flask(__name__)
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_platform_contracts(app)

    @app.get("/api/platform/success")
    def success():
        return success_response({"value": 42})

    @app.get("/api/platform/operation")
    def operation():
        return operation_response(
            {"id": "op-123", "kind": "service.deploy", "status": "queued", "poll_url": "/api/platform/operations/op-123"}
        )

    @app.get("/api/platform/error/<int:status>")
    def error(status: int):
        abort(status)

    @app.get("/api/platform/failure")
    def failure():
        raise RuntimeError("provider credentials=super-secret")

    return app


def test_request_id_is_propagated_and_generated(app: Flask):
    client = app.test_client()

    propagated = client.get("/api/platform/success", headers={REQUEST_ID_HEADER: "client-trace-123"})
    assert propagated.status_code == 200
    assert propagated.get_json() == {
        "data": {"value": 42},
        "request_id": "client-trace-123",
    }
    assert propagated.headers[REQUEST_ID_HEADER] == "client-trace-123"

    generated = client.get("/api/platform/success")
    generated_id = generated.get_json()["request_id"]
    assert generated.status_code == 200
    assert generated_id
    assert generated.headers[REQUEST_ID_HEADER] == generated_id
    assert generated_id != "client-trace-123"


def test_invalid_request_id_is_replaced(app: Flask):
    response = app.test_client().get(
        "/api/platform/success", headers={REQUEST_ID_HEADER: "bad value"}
    )
    assert response.status_code == 200
    assert response.get_json()["request_id"] != "bad value"
    assert response.headers[REQUEST_ID_HEADER] == response.get_json()["request_id"]


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (400, "BAD_REQUEST"),
        (401, "UNAUTHORIZED"),
        (403, "FORBIDDEN"),
        (404, "NOT_FOUND"),
        (409, "CONFLICT"),
        (422, "VALIDATION_ERROR"),
        (429, "RATE_LIMITED"),
        (500, "INTERNAL_SERVER_ERROR"),
    ],
)
def test_platform_http_errors_use_error_envelope(app: Flask, status: int, code: str):
    response = app.test_client().get(f"/api/platform/error/{status}")
    body = response.get_json()
    assert response.status_code == status
    assert body["error"] == {
        "code": code,
        "message": body["error"]["message"],
        "details": {},
    }
    assert body["request_id"] == response.headers[REQUEST_ID_HEADER]
    assert body["request_id"]


def test_unexpected_platform_errors_are_safe_and_enveloped(app: Flask):
    response = app.test_client().get("/api/platform/failure")
    assert response.status_code == 500
    assert response.get_json() == {
        "error": {
            "code": "INTERNAL_SERVER_ERROR",
            "message": "Internal server error",
            "details": {},
        },
        "request_id": response.headers[REQUEST_ID_HEADER],
    }
    assert "super-secret" not in response.get_data(as_text=True)


def test_operation_response_shape_is_stable(app: Flask):
    response = app.test_client().get("/api/platform/operation")
    assert response.status_code == 202
    assert response.get_json() == {
        "operation": {
            "id": "op-123",
            "kind": "service.deploy",
            "status": "queued",
            "poll_url": "/api/platform/operations/op-123",
        }
    }
    assert "request_id" not in response.get_json()


def test_operation_requires_contract_fields():
    with pytest.raises(ValueError, match="poll_url"):
        operation_envelope({"id": "op-1", "kind": "service.deploy", "status": "queued"})


def test_secret_redaction_is_recursive_and_non_mutating():
    original = {
        "name": "deploy",
        "password": "p@ss",
        "nested": [{"api_token": "tok", "safe": "value"}],
        "stderr": "TOKEN=inline-secret; region=local",
    }
    redacted = redact_sensitive(original)

    assert redacted == {
        "name": "deploy",
        "password": "[REDACTED]",
        "nested": [{"api_token": "[REDACTED]", "safe": "value"}],
        "stderr": "TOKEN=[REDACTED]; region=local",
    }
    assert original["password"] == "p@ss"
    assert original["nested"][0]["api_token"] == "tok"


def test_explicit_error_response_redacts_details(app: Flask):
    with app.test_request_context("/api/platform/explicit"):
        response, status = error_response(
            "SERVICE_OPERATION_CONFLICT",
            "cannot use token=raw-token",
            409,
            details={"secret": "raw-secret", "reason": "already running"},
        )
    assert status == 409
    assert response.get_json() == {
        "error": {
            "code": "SERVICE_OPERATION_CONFLICT",
            "message": "cannot use token=[REDACTED]",
            "details": {"secret": "[REDACTED]", "reason": "already running"},
        },
        "request_id": response.get_json()["request_id"],
    }
