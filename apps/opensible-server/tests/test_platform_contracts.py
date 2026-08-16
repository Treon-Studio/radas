"""Tests for the additive platform API response contracts."""
from __future__ import annotations

import logging

import pytest
from flask import Flask, Blueprint, abort, jsonify, request
from werkzeug.exceptions import MethodNotAllowed, TooManyRequests, Unauthorized

from api import register_blueprints
from api.platform_contracts import (
    REQUEST_ID_HEADER,
    error_response,
    operation_envelope,
    operation_response,
    redact_sensitive,
    register_platform_blueprint_contracts,
    success_response,
)
from api.platform_routes import register_error_handlers


@pytest.fixture
def app(tmp_path, monkeypatch) -> Flask:
    app = Flask(__name__)
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)

    # Exercise the production registration path, then add a small test-only
    # platform blueprint for contract behaviors not yet backed by a product
    # route.
    register_blueprints(app)
    # Production still installs these legacy app handlers; keep this fixture
    # representative while asserting the new finalizer bypasses them only for
    # the additive platform namespace.
    register_error_handlers(app)

    platform = Blueprint("test_platform", __name__)
    register_platform_blueprint_contracts(platform)

    @platform.get("/api/platform/success")
    def success():
        return success_response({"value": 42})

    @platform.get("/api/platform/explicit-request-id")
    def explicit_request_id():
        return success_response({"ok": True}, request_id_value="handler-id")

    @platform.get("/api/platform/operation")
    def operation():
        return operation_response(
            {
                "id": "op-123",
                "kind": "service.deploy",
                "status": "queued",
                "poll_url": "/api/platform/operations/op-123",
            }
        )

    @platform.get("/api/platform/error/<int:status>")
    def error(status: int):
        abort(status)

    @platform.get("/api/platform/retry")
    def retry():
        raise TooManyRequests(description="slow down", retry_after=60)

    @platform.get("/api/platform/auth")
    def auth():
        raise Unauthorized(www_authenticate=["Bearer realm=platform"])

    @platform.post("/api/platform/method")
    def method():
        raise MethodNotAllowed(valid_methods=["GET", "POST"])

    @platform.get("/api/platform/failure")
    def failure():
        raise RuntimeError(
            "provider access_token=raw-access refresh_token=raw-refresh "
            "client_secret=raw-client AWS_SECRET_ACCESS_KEY=raw-aws"
        )

    @platform.post("/api/platform/mutation")
    def mutation():
        return success_response(
            {"operation": "created", "client_secret": "must-not-leak"}, status=201
        )

    @platform.post("/api/platform/json-mutation")
    def json_mutation():
        return success_response({"payload": request.get_json()})

    @platform.get("/api/platform/get-only")
    def get_only():
        return success_response({"method": "GET"})

    app.register_blueprint(platform)

    @app.get("/legacy-failure")
    def legacy_failure():
        raise RuntimeError("legacy failure")

    @app.errorhandler(Exception)
    def legacy_exception(error):
        return jsonify({"legacy": type(error).__name__}), 599

    return app


@pytest.mark.parametrize("request_id", ["client-trace-123", "explicit:request-id"])
def test_request_id_is_authoritative_and_consistent(app: Flask, request_id: str):
    response = app.test_client().get(
        "/api/platform/success", headers={REQUEST_ID_HEADER: request_id}
    )
    assert response.status_code == 200
    assert response.get_json() == {
        "data": {"value": 42},
        "request_id": request_id,
    }
    assert response.headers[REQUEST_ID_HEADER] == request_id


def test_handler_request_id_input_is_authoritative(app: Flask):
    response = app.test_client().get(
        "/api/platform/explicit-request-id",
        headers={REQUEST_ID_HEADER: "client-id"},
    )
    assert response.status_code == 200
    assert response.get_json()["request_id"] == "handler-id"
    assert response.headers[REQUEST_ID_HEADER] == "handler-id"


def test_invalid_request_id_is_replaced(app: Flask):
    response = app.test_client().get(
        "/api/platform/success", headers={REQUEST_ID_HEADER: "bad value"}
    )
    assert response.status_code == 200
    generated = response.get_json()["request_id"]
    assert generated != "bad value\n"
    assert response.headers[REQUEST_ID_HEADER] == generated


def test_generated_request_id_is_shared_by_body_and_header(app: Flask):
    response = app.test_client().get("/api/platform/success")
    generated = response.get_json()["request_id"]
    assert generated
    assert response.headers[REQUEST_ID_HEADER] == generated


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (400, "BAD_REQUEST"),
        (401, "UNAUTHORIZED"),
        (403, "FORBIDDEN"),
        (404, "NOT_FOUND"),
        (405, "METHOD_NOT_ALLOWED"),
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
    assert body["error"]["code"] == code
    assert body["error"]["details"] == {}
    assert body["request_id"] == response.headers[REQUEST_ID_HEADER]


def test_platform_missing_route_is_enveloped_after_realistic_registration(app: Flask):
    response = app.test_client().get("/api/platform/does-not-exist")
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "NOT_FOUND"
    assert response.get_json()["request_id"] == response.headers[REQUEST_ID_HEADER]


def test_platform_root_namespace_is_enveloped(app: Flask):
    response = app.test_client().get("/api/platform")
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "NOT_FOUND"
    assert response.get_json()["request_id"] == response.headers[REQUEST_ID_HEADER]


def test_legacy_health_and_method_errors_keep_legacy_shapes(app: Flask, monkeypatch):
    import api.platform_routes as platform_routes

    monkeypatch.setattr(
        platform_routes, "readiness", lambda: {"ok": True, "checks": {"test": True}}
    )
    client = app.test_client()
    health = client.get("/healthz")
    assert health.status_code == 200
    assert health.get_json() == {"status": "ok"}
    assert REQUEST_ID_HEADER not in health.headers

    ready = client.get("/readyz")
    assert ready.status_code == 200
    assert ready.get_json() == {"ok": True, "checks": {"test": True}}
    assert REQUEST_ID_HEADER not in ready.headers

    missing = client.get("/healthz/missing")
    assert missing.status_code == 404
    assert missing.get_json() == {
        "error": "not_found",
        "message": "Not found",
        "code": "not_found",
    }
    assert REQUEST_ID_HEADER not in missing.headers

    wrong_method = client.post(
        "/api/platform/idempotency", headers={REQUEST_ID_HEADER: "legacy-id"}
    )
    assert wrong_method.status_code == 599
    assert wrong_method.get_json() == {"legacy": "MethodNotAllowed"}
    assert REQUEST_ID_HEADER not in wrong_method.headers


def test_new_platform_duplicate_preserves_json_body_and_reuses_first_envelope(
    app: Flask, tmp_path
):
    import api.platform_routes as platform_routes

    platform_routes._idem_path = lambda: tmp_path / "idempotency.json"
    client = app.test_client()
    headers = {"Idempotency-Key": "json-mutation-1", REQUEST_ID_HEADER: "first-request"}
    first = client.post("/api/platform/json-mutation", headers=headers, json={"x": 1})
    duplicate = client.post(
        "/api/platform/json-mutation",
        headers={"Idempotency-Key": "json-mutation-1", REQUEST_ID_HEADER: "second-request"},
        json={"x": 1},
    )

    assert first.status_code == duplicate.status_code == 200
    assert first.get_json() == duplicate.get_json()
    assert first.get_json()["data"]["payload"] == {"x": 1}
    assert first.get_json()["request_id"] == "first-request"
    assert duplicate.headers[REQUEST_ID_HEADER] == "first-request"


def test_new_platform_duplicate_reuses_redacted_first_envelope_and_request_id(
    app: Flask, tmp_path
):
    import api.platform_routes as platform_routes

    platform_routes._idem_path = lambda: tmp_path / "idempotency.json"
    client = app.test_client()
    headers = {"Idempotency-Key": "mutation-1", REQUEST_ID_HEADER: "first-request"}
    first = client.post("/api/platform/mutation", headers=headers, json={"x": 1})
    duplicate = client.post(
        "/api/platform/mutation",
        headers={"Idempotency-Key": "mutation-1", REQUEST_ID_HEADER: "second-request"},
        json={"x": 1},
    )

    assert first.status_code == duplicate.status_code == 201
    assert first.get_json() == duplicate.get_json()
    assert first.get_json()["request_id"] == "first-request"
    assert duplicate.headers[REQUEST_ID_HEADER] == "first-request"
    assert "must-not-leak" not in duplicate.get_data(as_text=True)
    stored = (tmp_path / "idempotency.json").read_text()
    assert "must-not-leak" not in stored


def test_new_platform_conflicting_idempotency_payload_returns_409_without_overwrite(
    app: Flask, tmp_path
):
    import api.platform_routes as platform_routes

    platform_routes._idem_path = lambda: tmp_path / "idempotency.json"
    client = app.test_client()
    first = client.post(
        "/api/platform/json-mutation",
        headers={"Idempotency-Key": "conflict-1", REQUEST_ID_HEADER: "first-request"},
        json={"x": 1},
    )
    conflict = client.post(
        "/api/platform/json-mutation",
        headers={"Idempotency-Key": "conflict-1", REQUEST_ID_HEADER: "conflict-request"},
        json={"x": 2},
    )
    duplicate = client.post(
        "/api/platform/json-mutation",
        headers={"Idempotency-Key": "conflict-1", REQUEST_ID_HEADER: "third-request"},
        json={"x": 1},
    )

    assert first.status_code == 200
    assert conflict.status_code == 409
    assert conflict.get_json()["error"]["code"] == "CONFLICT"
    assert conflict.get_json()["request_id"] == "conflict-request"
    assert duplicate.status_code == 200
    assert duplicate.get_json() == first.get_json()
    assert duplicate.headers[REQUEST_ID_HEADER] == "first-request"


def test_platform_wrong_method_preserves_405_and_allow_header(app: Flask):
    response = app.test_client().post("/api/platform/get-only")

    assert response.status_code == 405
    assert response.get_json()["error"]["code"] == "METHOD_NOT_ALLOWED"
    assert "GET" in response.headers["Allow"]


def test_unexpected_platform_errors_are_safe_and_logged_without_exception_text(
    app: Flask, caplog: pytest.LogCaptureFixture
):
    with caplog.at_level(logging.ERROR):
        response = app.test_client().get("/api/platform/failure")
    assert response.status_code == 500
    assert response.get_json()["error"] == {
        "code": "INTERNAL_SERVER_ERROR",
        "message": "Internal server error",
        "details": {},
    }
    assert response.get_json()["request_id"] == response.headers[REQUEST_ID_HEADER]
    output = response.get_data(as_text=True) + "\n" + caplog.text
    for secret in ("raw-access", "raw-refresh", "raw-client", "raw-aws"):
        assert secret not in output


def test_platform_error_headers_are_preserved(app: Flask):
    retry = app.test_client().get("/api/platform/retry")
    assert retry.status_code == 429
    assert retry.headers["Retry-After"] == "60"

    auth = app.test_client().get("/api/platform/auth")
    assert auth.status_code == 401
    assert auth.headers.getlist("WWW-Authenticate") == ["Bearer realm=platform"]

    allow = app.test_client().post("/api/platform/method")
    assert allow.status_code == 405
    assert "GET" in allow.headers["Allow"]


def test_operation_response_contains_consistent_request_id(app: Flask):
    response = app.test_client().get(
        "/api/platform/operation", headers={REQUEST_ID_HEADER: "operation-id"}
    )
    assert response.status_code == 202
    body = response.get_json()
    assert body["operation"]["id"] == "op-123"
    assert body["data"]["operation"]["id"] == "op-123"
    assert body["request_id"] == "operation-id"
    assert response.headers[REQUEST_ID_HEADER] == "operation-id"


def test_operation_requires_contract_fields():
    with pytest.raises(ValueError, match="poll_url"):
        operation_envelope({"id": "op-1", "kind": "service.deploy", "status": "queued"})


@pytest.mark.parametrize(
    "value",
    [
        "oauth.client_secret.value=raw-client",
        "auth.access_token.value=raw-access",
        "db.password.value=raw-password",
        "signing.private_key.value=raw-private-key",
    ],
)
def test_prefixed_dotted_inline_credentials_are_redacted(value: str):
    redacted = redact_sensitive(value)
    assert "raw-" not in redacted
    assert redacted.endswith("[REDACTED]")


def test_secret_redaction_covers_credentials_and_is_non_mutating():
    original = {
        "name": "deploy",
        "access_token": "access",
        "refresh-token": "refresh",
        "client_secret": "client",
        "AWS_SECRET_ACCESS_KEY": "aws",
        "private_key": "key",
        "nested": [{"safe": "value"}],
        "json": '{"access_token":"json-access","client_secret":"json-client"}',
        "authorization": "Bearer abc.def.ghi",
        "provider_message": "Bearer provider-token",
        "pem": "-----BEGIN PRIVATE KEY-----\\nsecret\\n-----END PRIVATE KEY-----",
    }
    redacted = redact_sensitive(original)

    assert redacted["access_token"] == "[REDACTED]"
    assert redacted["refresh-token"] == "[REDACTED]"
    assert redacted["client_secret"] == "[REDACTED]"
    assert redacted["AWS_SECRET_ACCESS_KEY"] == "[REDACTED]"
    assert redacted["private_key"] == "[REDACTED]"
    assert "json-access" not in redacted["json"]
    assert "json-client" not in redacted["json"]
    assert redacted["authorization"] == "[REDACTED]"
    assert redacted["provider_message"] == "Bearer [REDACTED]"
    assert "secret" not in redacted["pem"]
    assert original["access_token"] == "access"
    assert original["json"] == '{"access_token":"json-access","client_secret":"json-client"}'


def test_explicit_error_response_redacts_message_and_details(app: Flask):
    with app.test_request_context("/api/platform/explicit"):
        response, status = error_response(
            "SERVICE_OPERATION_CONFLICT",
            "cannot use access_token=raw-token Bearer raw-bearer",
            409,
            details={"client_secret": "raw-secret", "reason": "already running"},
        )
    assert status == 409
    body = response.get_json()
    assert body["error"]["message"] == (
        "cannot use access_token=[REDACTED] Bearer [REDACTED]"
    )
    assert body["error"]["details"] == {
        "client_secret": "[REDACTED]",
        "reason": "already running",
    }
    assert body["request_id"] == response.headers.get(REQUEST_ID_HEADER, body["request_id"])


def test_legacy_exception_handler_and_idempotency_route_are_unchanged(app: Flask, tmp_path):
    response = app.test_client().get("/legacy-failure")
    assert response.status_code == 599
    assert response.get_json() == {"legacy": "RuntimeError"}

    import api.platform_routes as platform_routes
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(platform_routes, "_idem_path", lambda: tmp_path / "idempotency.json")
    try:
        response = app.test_client().get(
            "/api/platform/idempotency", headers={REQUEST_ID_HEADER: "legacy-id"}
        )
    finally:
        monkeypatch.undo()
    assert response.status_code == 200
    assert response.get_json() == {"entries": 0}
    assert REQUEST_ID_HEADER not in response.headers
