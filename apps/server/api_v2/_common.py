"""Shared schemas + security scheme for the /api/v2 pilot.

Keep this module small: only cross-cutting concerns that every v2 blueprint
needs. Blueprint-specific schemas live in the blueprint file.
"""
from __future__ import annotations

from typing import Any

from marshmallow import Schema, fields


# ---------- Common response building blocks ----------

class ErrorResponse(Schema):
    """Matches the legacy ``{"success": False, "error": "..."}`` shape."""

    success = fields.Boolean(required=True, dump_default=False)
    error = fields.String(required=True)


class OkResponse(Schema):
    """Bare success acknowledgement used by many mutating endpoints."""

    success = fields.Boolean(required=True, dump_default=True)


# ---------- Shared envelope schemas (Task 2.2) ----------

#: Component names registered into the served /api/v2 document, in dependency
#: order (nested schemas first so ``$ref`` resolution sees them).
ENVELOPE_SCHEMA_NAMES: tuple[str, ...] = (
    "ErrorBody",
    "Operation",
    "SuccessEnvelope",
    "ErrorEnvelope",
    "OperationEnvelope",
)

# Legacy platform path mirrored at /api/v2 that is NOT part of the envelope
# contract (mirrors ``platform_contracts._LEGACY_PLATFORM_PATHS``).
_LEGACY_V2_PLATFORM_PATHS = frozenset({"/api/v2/platform/idempotency"})

_V2_HTTP_METHODS = frozenset(
    {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
)

#: Documented success statuses per platform envelope operation, keyed by
#: ``(METHOD, exact v2 path)``. Only operations whose runtime responses
#: provably return a shared envelope are listed; everything else keeps the
#: generic flask-smorest rendering. Deterministic by construction.
_PLATFORM_ENVELOPE_SUCCESS_STATUSES: dict[tuple[str, str], tuple[int, ...]] = {
    ("GET", "/api/v2/platform/catalog"): (200,),
    ("GET", "/api/v2/platform/catalog/{slug}"): (200,),
    ("POST", "/api/v2/platform/catalog"): (201,),
    ("POST", "/api/v2/platform/catalog/{slug}/{version}/deprecate"): (200,),
    # Service source deploy is the platform-contract async operation
    # (``operation_response(..., status=202)`` at runtime).
    (
        "POST",
        "/api/v2/projects/{project_id}/services/{service_id}/source/deploy",
    ): (202,),
}

#: Statuses documented with the async :class:`OperationEnvelope`.
_OPERATION_ENVELOPE_STATUSES = frozenset({202})


def register_contract_schemas(api) -> None:
    """Register the shared envelope schemas into the /api/v2 OpenAPI document.

    Called from ``init_api_v2``; failures propagate (fail closed) so a broken
    contract registration can never silently degrade the served document.
    """
    from .schemas.contracts import (
        ErrorBody,
        ErrorEnvelope,
        Operation,
        OperationEnvelope,
        SuccessEnvelope,
    )

    registry: dict[str, type[Schema]] = {
        "ErrorBody": ErrorBody,
        "Operation": Operation,
        "SuccessEnvelope": SuccessEnvelope,
        "ErrorEnvelope": ErrorEnvelope,
        "OperationEnvelope": OperationEnvelope,
    }
    for name in ENVELOPE_SCHEMA_NAMES:
        api.spec.components.schema(name, schema=registry[name])


def annotate_platform_envelope_operations(api) -> int:
    """Reference the shared envelope schemas from platform envelope operations.

    Deterministic post-processing over the rendered APISpec paths:

    - every operation in the platform namespace (``/api/v2/platform/*`` except
      the legacy ``/api/v2/platform/idempotency`` mirror) gets its ``default``
      error response pointed at ``#/components/schemas/ErrorEnvelope``;
    - operations listed in ``_PLATFORM_ENVELOPE_SUCCESS_STATUSES`` get their
      documented success status pointed at ``SuccessEnvelope`` (sync) or
      ``OperationEnvelope`` (202, async).

    Idempotent; call once from ``finalize_api_v2`` after the auto-proxies are
    mounted. Returns the number of operations annotated.
    """
    from .schemas.contracts import (
        ERROR_RESPONSE_DESCRIPTION,
        OPERATION_RESPONSE_DESCRIPTION,
        SUCCESS_RESPONSE_DESCRIPTION,
    )

    paths = getattr(api.spec, "_paths", None)
    if not isinstance(paths, dict):
        raise RuntimeError(
            "flask-smorest APISpec internals changed (_paths missing); "
            "cannot annotate platform envelope operations"
        )
    annotated = 0
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        path_text = str(path)
        is_platform_namespace = (
            path_text.startswith("/api/v2/platform/")
            and path_text not in _LEGACY_V2_PLATFORM_PATHS
        )
        for method, operation in path_item.items():
            method_text = str(method).lower()
            if method_text not in _V2_HTTP_METHODS or not isinstance(operation, dict):
                continue
            statuses = _PLATFORM_ENVELOPE_SUCCESS_STATUSES.get(
                (method_text.upper(), path_text), ()
            )
            if not is_platform_namespace and not statuses:
                continue
            responses: dict[str, Any] = operation.setdefault("responses", {})
            responses["default"] = {
                "description": ERROR_RESPONSE_DESCRIPTION,
                "content": {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/ErrorEnvelope"}
                    }
                },
            }
            for status in statuses:
                is_operation = status in _OPERATION_ENVELOPE_STATUSES
                responses[str(status)] = {
                    "description": (
                        OPERATION_RESPONSE_DESCRIPTION
                        if is_operation
                        else SUCCESS_RESPONSE_DESCRIPTION
                    ),
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": (
                                    "#/components/schemas/OperationEnvelope"
                                    if is_operation
                                    else "#/components/schemas/SuccessEnvelope"
                                )
                            }
                        }
                    },
                }
            annotated += 1
    return annotated


# ---------- Security scheme ----------

BEARER_AUTH_NAME = "BearerAuth"

BEARER_AUTH_SCHEME = {
    "type": "http",
    "scheme": "bearer",
    "bearerFormat": "JWT",
    "description": (
        "JWT access token issued by /api/auth/login, or an API token from "
        "/api/api-tokens. Prefix with 'Bearer '."
    ),
}


def apply_security(api) -> None:
    """Register the shared BearerAuth scheme on the flask-smorest Api."""
    try:
        api.spec.components.security_scheme(BEARER_AUTH_NAME, BEARER_AUTH_SCHEME)
    except Exception:  # pragma: no cover - already registered
        pass
