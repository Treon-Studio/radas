"""v2: feature flag domain — list, create, update, delete, evaluate (Task 2.3).

Handlers delegate to the v1 view functions so runtime responses stay
byte-identical; the explicit schemas below replace the generic auto-proxy
rendering of these operations in the served ``/api/v2`` document.

Scope/org security: flags resolve an explicit scope (``scope_type`` +
``scope_id``) or ambient project/org context (``X-Project-Id`` /
``X-Org-Id`` header, ``project_id``/``org_id`` body or query). Global-scope
mutations require admin; org/project mutations require the org owner/admin.
"""
from __future__ import annotations

from typing import Any, Optional

from flask.views import MethodView
from flask_smorest import Blueprint
from pydantic import BaseModel, ConfigDict, Field

from api.feature_flag_routes import (
    api_create_flag as _v1_create_flag,
    api_delete_flag as _v1_delete_flag,
    api_evaluate_flag as _v1_evaluate_flag,
    api_list_flags as _v1_list_flags,
    api_update_flag as _v1_update_flag,
)

from ._doc import (
    BEARER_SECURITY,
    ERROR_ENVELOPE_RESPONSE,
    IDEMPOTENCY_KEY_PARAMETER,
    PROJECT_HEADER_PARAMETER,
    doc,
    json_response,
    path_param,
)

blp = Blueprint(
    "flags_v2",
    __name__,
    url_prefix="/api/v2/flags",
    description="Tenant-scoped feature flags (list, create, update, delete, evaluate).",
)


# ---------- Request models ----------

class FlagCreateIn(BaseModel):
    """Flag body: ``key`` is required; every other registry field is optional
    and validated server-side (unknown keys are tolerated for forward-compat)."""

    model_config = ConfigDict(extra="allow")
    key: str = Field(min_length=1, max_length=200)
    name: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    enabled: Optional[bool] = None
    scope_type: Optional[str] = Field(
        default=None, description="global | organization | project (with scope_id)."
    )
    scope_id: Optional[str] = None


class FlagUpdateIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    enabled: Optional[bool] = None
    name: Optional[str] = None
    description: Optional[str] = None


class FlagEvaluateIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    key: str = Field(min_length=1, max_length=200)
    env: Optional[str] = None
    user: Optional[str] = None
    scope_type: Optional[str] = None
    scope_id: Optional[str] = None


# ---------- Response models ----------

class FlagRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    key: str
    name: Optional[str] = None
    enabled: Optional[bool] = None
    scope_type: Optional[str] = None
    scope_id: Optional[str] = None
    tags: Optional[list[str]] = None


class FlagsOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    flags: list[FlagRecord]


class FlagWriteOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool = True
    flag: FlagRecord


class FlagEvaluateOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    key: str
    enabled: bool
    reason: Optional[str] = None
    source: Optional[str] = None


# ---------- Routes ----------

@blp.route("")
class FlagsView(MethodView):
    @doc(
        responses={
            "200": json_response(FlagsOut, "Flags visible in the resolved scope (effective records include inherited org/global flags)."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[
            PROJECT_HEADER_PARAMETER,
            {
                "name": "scope_type",
                "in": "query",
                "required": False,
                "schema": {"type": "string", "enum": ["global", "organization", "project"]},
                "description": "Explicit listing scope (with scope_id).",
            },
            {
                "name": "scope_id",
                "in": "query",
                "required": False,
                "schema": {"type": "string"},
                "description": "Scope identifier for explicit organization/project listings.",
            },
            {
                "name": "tag",
                "in": "query",
                "required": False,
                "schema": {"type": "string"},
                "description": "Filter flags by tag.",
            },
            {
                "name": "env",
                "in": "query",
                "required": False,
                "schema": {"type": "string"},
                "description": "Only flags enabled in this environment.",
            },
            {
                "name": "enabled",
                "in": "query",
                "required": False,
                "schema": {"type": "boolean"},
                "description": "Only enabled (true) or disabled (false) flags.",
            },
        ],
        security=BEARER_SECURITY,
    )
    def get(self):
        """List feature flags in the resolved scope."""
        return _v1_list_flags()

    @doc(
        request_model=FlagCreateIn,
        responses={
            "201": json_response(FlagWriteOut, "Created flag."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[IDEMPOTENCY_KEY_PARAMETER, PROJECT_HEADER_PARAMETER],
        security=BEARER_SECURITY,
    )
    def post(self):
        """Create a feature flag in the resolved scope (admin-gated for global)."""
        return _v1_create_flag()


@blp.route("/<string:key>")
class FlagView(MethodView):
    @doc(
        request_model=FlagUpdateIn,
        responses={
            "200": json_response(FlagWriteOut, "Updated flag."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[
            path_param("key", "Flag key (dot-namespaced, e.g. safety.cloud.apply.block)."),
            IDEMPOTENCY_KEY_PARAMETER,
            PROJECT_HEADER_PARAMETER,
        ],
        security=BEARER_SECURITY,
    )
    def patch(self, key: str):
        """Update a feature flag in the resolved scope."""
        return _v1_update_flag(key)

    @doc(
        responses={
            "200": json_response(FlagWriteOut, "Deleted flag."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[
            path_param("key", "Flag key."),
            IDEMPOTENCY_KEY_PARAMETER,
            PROJECT_HEADER_PARAMETER,
        ],
        security=BEARER_SECURITY,
    )
    def delete(self, key: str):
        """Delete a feature flag from the resolved scope."""
        return _v1_delete_flag(key)


@blp.route("/evaluate")
class FlagEvaluateView(MethodView):
    @doc(
        request_model=FlagEvaluateIn,
        responses={
            "200": json_response(
                FlagEvaluateOut,
                "Evaluation result: enabled plus the matched scope/reason. "
                "Evaluation fails closed (enabled=false) on errors.",
            ),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[PROJECT_HEADER_PARAMETER, IDEMPOTENCY_KEY_PARAMETER],
        security=BEARER_SECURITY,
    )
    def post(self):
        """Evaluate a flag for the current user and resolved scope."""
        return _v1_evaluate_flag()
