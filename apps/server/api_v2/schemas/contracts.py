"""Stable envelope schemas for the ``/api/v2`` contract (Task 2.2).

These schemas are the documented form of the response envelopes produced at
runtime by ``api.platform_contracts`` (``success_envelope``, ``error_envelope``,
``operation_envelope``). They are registered into the served ``/api/v2``
OpenAPI document by ``api_v2._common.register_contract_schemas`` and referenced
from the platform envelope operations, so console/CLI can bind to a stable
contract instead of guessing payload shapes.

Policy encoded here (and asserted in ``tests/test_shared_envelopes.py``):

- Every envelope carries a correlation ``request_id`` (mirrored in the
  ``X-Request-ID`` response header).
- Error bodies are structured: ``{code, message, details}``. ``details`` must
  never carry credential material — credential-like keys and inline secret
  values are redacted to ``[REDACTED]`` before serialization — and must never
  contain internal exception text.
- Retryability is exposed only as the boolean ``retryable`` or the category
  token ``retry_category`` inside ``details``, never as free-form text.
- Legacy ``/api/*`` payloads are untouched; these schemas describe the
  additive platform envelope surface only.
"""
from __future__ import annotations

from marshmallow import EXCLUDE, INCLUDE, Schema, fields

# ---------------------------------------------------------------------------
# Shared description fragments (single source of truth for the policy text
# rendered into the OpenAPI document).
# ---------------------------------------------------------------------------

REQUEST_ID_DESCRIPTION = (
    "Opaque request correlation identifier, echoed in the X-Request-ID "
    "response header. A well-formed client-supplied X-Request-ID is reused; "
    "otherwise a fresh UUID is generated."
)

REDACTION_POLICY_NOTE = (
    "Redaction policy: credential material (passwords, tokens, API keys, "
    "secrets, private keys, authorization headers) is replaced with "
    "[REDACTED] before serialization. This field never carries credential "
    "material or internal exception text."
)

RETRYABILITY_POLICY_NOTE = (
    "Retryability, when present, is expressed only as the boolean "
    "'retryable' or the category token 'retry_category' — never as "
    "free-form text."
)

SUCCESS_RESPONSE_DESCRIPTION = (
    "Success envelope: opaque operation-specific payload plus a request "
    "correlation identifier. Credential material is redacted to [REDACTED]."
)

ERROR_RESPONSE_DESCRIPTION = (
    "Structured error envelope: stable machine-readable code, human-readable "
    "message and machine-readable details. Credential material is redacted "
    "to [REDACTED]; retryability appears only as a boolean or category token."
)

OPERATION_RESPONSE_DESCRIPTION = (
    "Asynchronous operation envelope: the queued operation (poll its "
    "poll_url) plus a request correlation identifier. Credential material is "
    "redacted to [REDACTED]."
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class SuccessEnvelope(Schema):
    """Standard successful response body: ``{"data": ..., "request_id": ...}``."""

    data = fields.Raw(
        required=True,
        allow_none=True,
        metadata={
            "description": (
                "Opaque, operation-specific success payload. Structure is "
                "defined per endpoint. " + REDACTION_POLICY_NOTE
            )
        },
    )
    request_id = fields.String(
        required=True,
        metadata={"description": REQUEST_ID_DESCRIPTION},
    )


class ErrorBody(Schema):
    """Structured error payload: ``{code, message, details}``."""

    code = fields.String(
        required=True,
        metadata={
            "description": (
                "Stable machine-readable error category token, for example "
                "VALIDATION_ERROR, NOT_FOUND, RATE_LIMITED."
            )
        },
    )
    message = fields.String(
        required=True,
        metadata={
            "description": (
                "Human-readable summary safe for display. " + REDACTION_POLICY_NOTE
            )
        },
    )
    details = fields.Dict(
        keys=fields.String(),
        values=fields.Raw(),
        required=True,
        metadata={
            "description": (
                "Machine-readable error context, for example "
                "{'errors': [...]} for VALIDATION_ERROR failures. "
                + REDACTION_POLICY_NOTE
                + " "
                + RETRYABILITY_POLICY_NOTE
            )
        },
    )


class ErrorEnvelope(Schema):
    """Standard error body: ``{"error": {...}, "request_id": ...}``."""

    error = fields.Nested(
        ErrorBody,
        required=True,
        metadata={"description": "Structured error payload."},
    )
    request_id = fields.String(
        required=True,
        metadata={"description": REQUEST_ID_DESCRIPTION},
    )


class Operation(Schema):
    """Asynchronous operation descriptor.

    Runtime operations may carry additional keys (timestamps, progress,
    result previews); unknown keys are preserved on load so validation never
    rejects a forward-compatible payload.
    """

    class Meta:
        unknown = INCLUDE

    id = fields.String(
        required=True,
        metadata={"description": "Stable operation identifier used for polling."},
    )
    kind = fields.String(
        required=True,
        metadata={
            "description": "Operation kind token, for example 'service.deploy'."
        },
    )
    status = fields.String(
        required=True,
        metadata={
            "description": (
                "Lifecycle status token, for example 'queued', 'running', "
                "'succeeded' or 'failed'."
            )
        },
    )
    poll_url = fields.String(
        required=True,
        metadata={
            "description": "Relative URL a client polls for operation progress and result."
        },
    )


class OperationEnvelope(Schema):
    """Async operation body: ``{"operation": {...}, "request_id": ...}``."""

    class Meta:
        unknown = EXCLUDE

    operation = fields.Nested(
        Operation,
        required=True,
        metadata={"description": "The queued or running operation."},
    )
    data = fields.Dict(
        required=False,
        metadata={
            "description": (
                "Deprecated compatibility alias mirroring the operation under "
                "'data.operation' for older console clients. New clients must "
                "read the top-level 'operation' field."
            )
        },
    )
    request_id = fields.String(
        required=True,
        metadata={"description": REQUEST_ID_DESCRIPTION},
    )
