"""Opt-in response contracts for the additive platform API namespace.

Legacy routes intentionally keep their existing response and exception behavior.
Platform blueprints opt in to scoped exception handlers, while the app-level
response finalizer only normalizes errors for the platform URL namespace.
"""
from __future__ import annotations

from collections.abc import Mapping
import re
from typing import Any
from uuid import uuid4

from flask import Flask, Response, Blueprint, current_app, g, has_request_context, jsonify, request
from werkzeug.exceptions import HTTPException

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SENSITIVE_NAME = (
    r"(?:password|passwd|secret|token|api[_-]?key|authorization|credential|"
    r"access[_-]?token|refresh[_-]?token|client[_-]?secret|"
    r"aws[_-]?(?:secret[_-]?access[_-]?key|session[_-]?token)|private[_-]?key)"
)
_SENSITIVE_KEY_RE = re.compile(rf"(?i)^(?:.*[_\-.])?{_SENSITIVE_NAME}(?:[_\-.].*)?$")
# Inline provider/configuration fields are often prefixed with a dotted
# namespace (for example ``oauth.client_secret.value=raw``). Keep the
# sensitive segment explicit while allowing those prefixes and suffixes.
_SENSITIVE_INLINE_NAME = rf"(?:[\w-]+\.)*{_SENSITIVE_NAME}(?:\.[\w-]+)*"
_SENSITIVE_QUOTED_VALUE_RE = re.compile(
    rf"(?i)(?P<prefix>[\"']?{_SENSITIVE_INLINE_NAME}[\"']?\s*(?:=|:)\s*)"
    rf"(?P<quote>[\"'])(?P<value>.*?)(?P=quote)"
)
_SENSITIVE_UNQUOTED_VALUE_RE = re.compile(
    rf"(?i)(?P<prefix>[\"']?{_SENSITIVE_INLINE_NAME}[\"']?\s*(?:=|:)\s*)"
    r"(?P<value>[^\s,;}]+)"
)
_BEARER_RE = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")
_PRIVATE_KEY_RE = re.compile(
    r"(?is)-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----"
)

_ERROR_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_SERVER_ERROR",
}
_LEGACY_PLATFORM_PATHS = {"/api/platform/idempotency"}


def generate_request_id() -> str:
    """Return a fresh opaque request identifier."""
    return str(uuid4())


def _valid_request_id(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if _REQUEST_ID_RE.fullmatch(value) else None


def extract_request_id(headers: Mapping[str, str] | None = None) -> str | None:
    """Extract a safe client request ID, or ``None`` when it is unusable."""
    if headers is None:
        headers = request.headers if has_request_context() else {}
    value = headers.get(REQUEST_ID_HEADER) or headers.get("Request-Id")
    return _valid_request_id(value)


def _set_request_id(value: str | None) -> str:
    if has_request_context():
        if value is not None:
            safe_value = _valid_request_id(value)
            if safe_value is not None:
                # Explicit helper inputs are authoritative for this response.
                g.platform_request_id = safe_value
        existing = _valid_request_id(getattr(g, "platform_request_id", None))
        if existing is not None:
            g.platform_request_id = existing
            return existing
        generated = generate_request_id()
        g.platform_request_id = generated
        return generated
    return _valid_request_id(value) or generate_request_id()


def get_request_id() -> str:
    """Return the authoritative request ID for the current request."""
    if has_request_context():
        existing = _valid_request_id(getattr(g, "platform_request_id", None))
        return existing or _set_request_id(extract_request_id())
    return generate_request_id()


def set_request_id(value: str | None) -> str:
    """Set the authoritative request ID for a response in this request."""
    return _set_request_id(value)


def request_id() -> str:
    """Backward-compatible shorthand for :func:`get_request_id`."""
    return get_request_id()


def redact_sensitive(value: Any) -> Any:
    """Copy ``value`` while removing credential-like fields and values."""
    if isinstance(value, Mapping):
        return {
            key: "[REDACTED]" if _SENSITIVE_KEY_RE.match(str(key)) else redact_sensitive(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_sensitive(item) for item in value)
    if isinstance(value, set):
        return {redact_sensitive(item) for item in value}
    if isinstance(value, str):
        value = _PRIVATE_KEY_RE.sub("[REDACTED]", value)
        value = _BEARER_RE.sub("Bearer [REDACTED]", value)
        value = _SENSITIVE_QUOTED_VALUE_RE.sub(
            lambda match: f"{match.group('prefix')}{match.group('quote')}[REDACTED]{match.group('quote')}",
            value,
        )
        return _SENSITIVE_UNQUOTED_VALUE_RE.sub(
            lambda match: f"{match.group('prefix')}[REDACTED]", value
        )
    return value


# Short alias for route code that already uses the common term.
redact = redact_sensitive


def success_envelope(data: Any, *, request_id_value: str | None = None) -> dict[str, Any]:
    """Build the standard successful API body without exposing credentials."""
    return {"data": redact_sensitive(data), "request_id": _set_request_id(request_id_value)}


def error_envelope(
    code: str,
    message: str,
    *,
    details: Mapping[str, Any] | None = None,
    request_id_value: str | None = None,
) -> dict[str, Any]:
    """Build a safe standard error body."""
    return {
        "error": {
            "code": code,
            "message": redact_sensitive(str(message)),
            "details": redact_sensitive(dict(details or {})),
        },
        "request_id": _set_request_id(request_id_value),
    }


def operation_envelope(
    operation: Mapping[str, Any], *, request_id_value: str | None = None
) -> dict[str, Any]:
    """Build the standard asynchronous operation body."""
    required = ("id", "kind", "status", "poll_url")
    missing = [field for field in required if field not in operation]
    if missing:
        raise ValueError(f"operation is missing required fields: {', '.join(missing)}")
    return {
        "operation": redact_sensitive(dict(operation)),
        "request_id": _set_request_id(request_id_value),
    }


def success_response(data: Any, status: int = 200, *, request_id_value: str | None = None):
    """Return a Flask response tuple for a successful platform API call."""
    return jsonify(success_envelope(data, request_id_value=request_id_value)), status


def error_response(
    code: str,
    message: str,
    status: int = 400,
    *,
    details: Mapping[str, Any] | None = None,
    request_id_value: str | None = None,
):
    """Return a Flask response tuple for a platform API error."""
    return jsonify(
        error_envelope(
            code,
            message,
            details=details,
            request_id_value=request_id_value,
        )
    ), status


def operation_response(
    operation: Mapping[str, Any],
    status: int = 202,
    *,
    request_id_value: str | None = None,
):
    """Return a response for a queued or running operation."""
    return jsonify(
        operation_envelope(operation, request_id_value=request_id_value)
    ), status


def is_platform_request() -> bool:
    """Whether the active request uses the additive contract namespace."""
    if not has_request_context():
        return False
    # The namespace root is part of the new contract even though it has no
    # view. Exact legacy paths remain outside the contract by design.
    return (request.path == "/api/platform" or request.path.startswith("/api/platform/")) and (
        request.path not in _LEGACY_PLATFORM_PATHS
    )


def _copy_response_headers(source: Response, target: Response) -> Response:
    """Copy headers that belong to the response, not to its replaced body."""
    for key, value in source.headers.items():
        if key.lower() not in {"content-length", "content-type"}:
            target.headers.add(key, value)
    return target


def _http_error_response(error: HTTPException):
    status = error.code or 500
    code = _ERROR_CODES.get(status, f"HTTP_{status}")
    message = error.description if status < 500 else "Internal server error"
    response = current_app.make_response(
        error_response(code, str(message), status=status)
    )
    return _copy_response_headers(error.get_response(), response)


def _platform_exception_response(error: Exception):
    # Deliberately do not log str(error), args, or a traceback: provider
    # exceptions routinely contain credentials. The type and request ID are
    # sufficient for correlation without exposing exception content.
    current_app.logger.error(
        "Unhandled platform API error type=%s request_id=%s",
        type(error).__name__,
        get_request_id(),
    )
    return error_response(
        "INTERNAL_SERVER_ERROR", "Internal server error", status=500
    )


def register_platform_blueprint_contracts(blueprint: Blueprint) -> None:
    """Install handlers on one platform blueprint, without touching legacy app handlers."""
    if getattr(blueprint, "_platform_contracts_registered", False):
        return
    blueprint._platform_contracts_registered = True

    def handle_http_error(error: HTTPException):
        return _http_error_response(error)

    def handle_exception(error: Exception):
        return _platform_exception_response(error)

    blueprint.register_error_handler(HTTPException, handle_http_error)
    blueprint.register_error_handler(Exception, handle_exception)


def _is_error_envelope(body: Any) -> bool:
    return isinstance(body, Mapping) and isinstance(body.get("error"), Mapping)


def _normalize_platform_error(response: Response) -> Response:
    body = response.get_json(silent=True)
    request_value = get_request_id()
    if response.status_code >= 500:
        body = error_envelope(
            "INTERNAL_SERVER_ERROR", "Internal server error", request_id_value=request_value
        )
    elif _is_error_envelope(body):
        body = dict(body)
        body["request_id"] = request_value
        body["error"] = redact_sensitive(dict(body["error"]))
    else:
        message = "Request failed"
        if isinstance(body, Mapping) and isinstance(body.get("message"), str):
            message = body["message"]
        body = error_envelope(
            _ERROR_CODES.get(response.status_code, f"HTTP_{response.status_code}"),
            message,
            request_id_value=request_value,
        )
    normalized = jsonify(body)
    normalized.status_code = response.status_code
    return _copy_response_headers(response, normalized)


def register_platform_contracts(app: Flask) -> None:
    """Opt the platform namespace into request IDs and safe error finalization."""
    if app.extensions.get("platform_contracts_registered"):
        return
    app.extensions["platform_contracts_registered"] = True

    @app.before_request
    def _platform_request_id() -> None:
        if is_platform_request():
            get_request_id()

    @app.after_request
    def _platform_contract_response(response: Response) -> Response:
        if not is_platform_request():
            return response
        # Routing 404s can be intercepted by a pre-existing app-level handler
        # before Flask has a blueprint to dispatch. Recover the intended status
        # from the unmatched rule without changing legacy URLs.
        if request.url_rule is None:
            # An older app-level catch-all may have converted routing errors to
            # its legacy status. The platform namespace owns unmatched routes.
            response.status_code = 404
        if response.status_code >= 400:
            response = _normalize_platform_error(response)
        response.headers[REQUEST_ID_HEADER] = get_request_id()
        return response
