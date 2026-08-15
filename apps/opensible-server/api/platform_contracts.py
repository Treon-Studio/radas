"""Response contracts for new project-platform APIs.

Legacy endpoints intentionally keep their existing response shapes.  New
platform endpoints should use the envelope helpers in this module and opt in
to :func:`register_platform_contracts` during application setup.
"""
from __future__ import annotations

from collections.abc import Mapping
import re
from typing import Any
from uuid import uuid4

from flask import Flask, Response, current_app, g, has_request_context, jsonify, request
from werkzeug.exceptions import HTTPException

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SENSITIVE_KEY_RE = re.compile(
    r"(?i)(?:password|passwd|secret|token|api[_-]?key|authorization|credential|private[_-]?key)"
)
_SENSITIVE_VALUE_RE = re.compile(
    r"(?i)(\b(?:password|passwd|secret|token|api[_-]?key|authorization|credential)\b\s*"
    r"(?:=|:)\s*)(?:\"[^\"]*\"|'[^']*'|[^\s,;}]+)"
)

_ERROR_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_SERVER_ERROR",
}


def generate_request_id() -> str:
    """Return a fresh opaque request identifier."""
    return str(uuid4())


def extract_request_id(headers: Mapping[str, str] | None = None) -> str | None:
    """Extract a safe client request ID, or ``None`` when it is unusable."""
    if headers is None:
        headers = request.headers if has_request_context() else {}
    value = headers.get(REQUEST_ID_HEADER) or headers.get("Request-Id")
    if value is None:
        return None
    value = str(value).strip()
    return value if _REQUEST_ID_RE.fullmatch(value) else None


def get_request_id() -> str:
    """Return the request ID for the current request, creating one if needed."""
    if has_request_context():
        existing = getattr(g, "platform_request_id", None)
        if existing:
            return existing
        value = extract_request_id() or generate_request_id()
        g.platform_request_id = value
        return value
    return generate_request_id()


def request_id() -> str:
    """Backward-friendly shorthand for :func:`get_request_id`."""
    return get_request_id()


def redact_sensitive(value: Any) -> Any:
    """Return ``value`` with credential-like fields and inline values redacted.

    Mappings and sequences are copied recursively so callers can safely pass
    exception details or provider output without mutating their source data.
    """
    if isinstance(value, Mapping):
        return {
            key: "[REDACTED]" if _SENSITIVE_KEY_RE.search(str(key)) else redact_sensitive(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_sensitive(item) for item in value)
    if isinstance(value, str):
        return _SENSITIVE_VALUE_RE.sub(r"\1[REDACTED]", value)
    return value


# Short alias for route code that already uses the common term.
redact = redact_sensitive


def success_envelope(data: Any, *, request_id_value: str | None = None) -> dict[str, Any]:
    """Build the standard successful API body."""
    return {"data": data, "request_id": request_id_value or get_request_id()}


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
            "message": redact_sensitive(message),
            "details": redact_sensitive(dict(details or {})),
        },
        "request_id": request_id_value or get_request_id(),
    }


def operation_envelope(
    operation: Mapping[str, Any], *, request_id_value: str | None = None
) -> dict[str, Any]:
    """Build the standard asynchronous operation body."""
    required = ("id", "kind", "status", "poll_url")
    missing = [field for field in required if field not in operation]
    if missing:
        raise ValueError(f"operation is missing required fields: {', '.join(missing)}")
    return {"operation": redact_sensitive(dict(operation))}


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
    """Return a Flask response tuple for a queued/running operation."""
    return jsonify(operation_envelope(operation, request_id_value=request_id_value)), status


def is_platform_request() -> bool:
    """Whether the active request is in the additive platform API namespace."""
    return has_request_context() and (
        request.path == "/api/platform" or request.path.startswith("/api/platform/")
    )


def _http_error_response(error: HTTPException):
    status = error.code or 500
    code = _ERROR_CODES.get(status, f"HTTP_{status}")
    message = error.description if status < 500 else "Internal server error"
    response = current_app.make_response(
        error_response(code, str(message), status=status)
    )
    original = error.get_response()
    if original.headers.get("Retry-After"):
        response.headers["Retry-After"] = original.headers["Retry-After"]
    return response


def register_platform_contracts(app: Flask) -> None:
    """Opt the additive ``/api/platform`` namespace into these contracts."""
    if app.extensions.get("platform_contracts_registered"):
        return
    app.extensions["platform_contracts_registered"] = True

    @app.before_request
    def _platform_request_id() -> None:
        if is_platform_request():
            get_request_id()

    @app.after_request
    def _platform_request_id_header(response: Response) -> Response:
        if is_platform_request():
            response.headers[REQUEST_ID_HEADER] = get_request_id()
        return response

    def handle_http_error(error: HTTPException):
        if is_platform_request():
            return _http_error_response(error)
        return error

    for status in _ERROR_CODES:
        app.register_error_handler(status, handle_http_error)

    @app.errorhandler(Exception)
    def handle_unexpected_error(error: Exception):
        if is_platform_request():
            app.logger.exception("Unhandled platform API error", exc_info=error)
            return error_response("INTERNAL_SERVER_ERROR", "Internal server error", status=500)
        raise error
