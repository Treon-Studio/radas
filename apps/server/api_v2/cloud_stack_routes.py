"""v2: cloud stack domain — stack list/get/create/update/delete and actions.

Handlers delegate to the cloud-provisioning v1 views so runtime responses
stay byte-identical; the explicit schemas below replace the generic
auto-proxy rendering of these operations in the served ``/api/v2`` document.

Project scoping: every operation resolves the project from the
``X-Project-Id`` header (preferred), ``project_id`` query or JSON body; the
caller must belong to the organization owning the project.
"""
from __future__ import annotations

from typing import Any, Optional

from flask.views import MethodView
from flask_smorest import Blueprint
from pydantic import BaseModel, ConfigDict, Field

from services.cloud_provisioning import (
    stacks_action as _v1_stack_action,
    stacks_create as _v1_stack_create,
    stacks_delete as _v1_stack_delete,
    stacks_get as _v1_stack_get,
    stacks_list as _v1_stacks_list,
    stacks_update as _v1_stack_update,
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
    "cloud_stack_v2",
    __name__,
    url_prefix="/api/v2/cloud",
    description="OpenTofu/Terraform cloud stacks (list, inspect, mutate, run actions).",
)


# ---------- Request models ----------

class StackCreateIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = Field(
        min_length=3,
        max_length=50,
        description="Lowercase letters, digits, '-' or '_' (3-50 chars).",
    )
    provider: str = "bytedc"
    values: dict[str, Any] = Field(default_factory=dict)


class StackUpdateIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    values: dict[str, Any] = Field(default_factory=dict)


class StackActionIn(BaseModel):
    """One of the stack lifecycle actions (plan/apply/destroy/refresh/lock/...).

    The runtime validates the action token and returns the error envelope for
    unsupported or blocked actions; extra keys carry action-specific inputs
    (worker_id, priority, address, reason, ...).
    """

    model_config = ConfigDict(extra="allow")
    action: str = Field(min_length=1, max_length=64)


# ---------- Response models ----------

class StackSummary(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str
    provider: Optional[str] = None
    env: Optional[str] = None
    cloud_project: Optional[str] = None
    region: Optional[str] = None
    last_action: Optional[str] = None
    last_status: Optional[str] = None


class StacksOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    stacks: list[StackSummary]


class StackDetail(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str
    provider: Optional[str] = None
    files: Optional[list[str]] = None
    has_secrets: Optional[bool] = None
    locked: Optional[bool] = None
    lock_reason: Optional[str] = None
    outputs: Optional[dict[str, Any]] = None


class StackWriteOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    ok: bool = True
    name: str


class StackDeleteOut(BaseModel):
    """Successful delete: the runtime returns exactly ``{"ok": true}``
    (services/cloud_provisioning.py) — unlike PUT/POST, no stack name."""

    model_config = ConfigDict(extra="allow")
    ok: bool = True


class StackActionOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    ok: bool = True


# ---------- Routes ----------

@blp.route("/stacks")
class StacksView(MethodView):
    @doc(
        responses={
            "200": json_response(StacksOut, "Stacks of the scoped project with their latest run status."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[PROJECT_HEADER_PARAMETER],
        security=BEARER_SECURITY,
    )
    def get(self):
        """List the project's cloud stacks with latest-run status."""
        return _v1_stacks_list()

    @doc(
        request_model=StackCreateIn,
        responses={
            "201": json_response(StackWriteOut, "Created stack."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[IDEMPOTENCY_KEY_PARAMETER, PROJECT_HEADER_PARAMETER],
        security=BEARER_SECURITY,
    )
    def post(self):
        """Create a cloud stack from a provider template in the scoped project."""
        return _v1_stack_create()


@blp.route("/stacks/<string:name>")
class StackView(MethodView):
    @doc(
        responses={
            "200": json_response(StackDetail, "Stack files, provider metadata, drift and lock state."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[
            path_param("name", "Stack name (lowercase letters, digits, '-' or '_')."),
            PROJECT_HEADER_PARAMETER,
        ],
        security=BEARER_SECURITY,
    )
    def get(self, name: str):
        """Inspect one cloud stack of the scoped project."""
        return _v1_stack_get(name)

    @doc(
        request_model=StackUpdateIn,
        responses={
            "200": json_response(StackWriteOut, "Updated stack."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[
            path_param("name", "Stack name."),
            IDEMPOTENCY_KEY_PARAMETER,
            PROJECT_HEADER_PARAMETER,
        ],
        security=BEARER_SECURITY,
    )
    def put(self, name: str):
        """Update a stack's variable values (secrets are separated server-side)."""
        return _v1_stack_update(name)

    @doc(
        responses={
            "200": json_response(StackDeleteOut, "Deleted stack (body is ``{'ok': true}``)."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[
            path_param("name", "Stack name."),
            IDEMPOTENCY_KEY_PARAMETER,
            PROJECT_HEADER_PARAMETER,
        ],
        security=BEARER_SECURITY,
    )
    def delete(self, name: str):
        """Delete a cloud stack (working directory and metadata)."""
        return _v1_stack_delete(name)


@blp.route("/stacks/<string:name>/actions")
class StackActionsView(MethodView):
    @doc(
        request_model=StackActionIn,
        request_description=(
            "The lifecycle action to run: plan, apply, destroy, refresh, lock, "
            "unlock, taint, untaint, ... Mutating actions honor feature-flag "
            "and lock safety gates (blocked with 423) and queue a worker run."
        ),
        responses={
            "200": json_response(
                StackActionOut,
                "Action accepted or executed (mutating actions queue a run and "
                "return run identifiers; lock/taint style actions apply "
                "immediately).",
            ),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[
            path_param("name", "Stack name."),
            IDEMPOTENCY_KEY_PARAMETER,
            PROJECT_HEADER_PARAMETER,
        ],
        security=BEARER_SECURITY,
    )
    def post(self, name: str):
        """Run a lifecycle action on a cloud stack (gated, worker-queued)."""
        return _v1_stack_action(name)
