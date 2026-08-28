"""v2: approval workflow domain — list, create, approve, reject (Task 2.3).

Handlers delegate to the v1 view functions so runtime responses stay
byte-identical; the explicit schemas below replace the generic auto-proxy
rendering of these operations in the served ``/api/v2`` document.

Project scoping: approvals are project-scoped records; the project resolves
from the ``X-Project-Id`` header (preferred), ``project_id`` query or body,
and the caller must belong to the owning organization.
"""
from __future__ import annotations

from typing import Optional

from flask.views import MethodView
from flask_smorest import Blueprint
from pydantic import BaseModel, ConfigDict, Field

from api.approval_routes import (
    api_approve as _v1_approve,
    api_create_approval as _v1_create_approval,
    api_list_approvals as _v1_list_approvals,
    api_reject as _v1_reject,
)

from ._doc import (
    BEARER_SECURITY,
    ERROR_ENVELOPE_RESPONSE,
    IDEMPOTENCY_KEY_PARAMETER,
    PROJECT_HEADER_PARAMETER,
    doc,
    json_response,
    path_param,
    query_param,
)

blp = Blueprint(
    "approvals_v2",
    __name__,
    url_prefix="/api/v2/approvals",
    description="Approval workflow for destructive cloud actions (UC50/68/72).",
)


# ---------- Request models ----------

class ApprovalCreateIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    stack: str = Field(min_length=1, max_length=200)
    action: str = Field(description="apply | destroy | plan")
    project_id: Optional[str] = Field(
        default=None, description="Defaults to the X-Project-Id header context."
    )
    note: Optional[str] = None


# ---------- Response models ----------

class ApprovalRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    stack: str
    project_id: Optional[str] = None
    action: str
    status: str
    requested_by: Optional[str] = None
    note: Optional[str] = None


class ApprovalsOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    approvals: list[ApprovalRecord]


class ApprovalWriteOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool = True
    approval: ApprovalRecord


# ---------- Routes ----------

@blp.route("")
class ApprovalsView(MethodView):
    @doc(
        responses={
            "200": json_response(ApprovalsOut, "Approvals for the scoped project (optionally filtered by status)."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[
            PROJECT_HEADER_PARAMETER,
            query_param("project_id", "Explicit project scope (X-Project-Id header is preferred)."),
            query_param("status", "Filter by lifecycle status (pending/approved/rejected/expired)."),
        ],
        security=BEARER_SECURITY,
    )
    def get(self):
        """List approval requests for the scoped project."""
        return _v1_list_approvals()

    @doc(
        request_model=ApprovalCreateIn,
        responses={
            "201": json_response(ApprovalWriteOut, "Created approval request."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[IDEMPOTENCY_KEY_PARAMETER, PROJECT_HEADER_PARAMETER],
        security=BEARER_SECURITY,
    )
    def post(self):
        """Request an approval for a stack action (one pending per action)."""
        return _v1_create_approval()


@blp.route("/<string:approval_id>/approve")
class ApproveView(MethodView):
    @doc(
        responses={
            "200": json_response(ApprovalWriteOut, "Approved approval record."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[
            path_param("approval_id", "Approval record id."),
            IDEMPOTENCY_KEY_PARAMETER,
            PROJECT_HEADER_PARAMETER,
        ],
        security=BEARER_SECURITY,
    )
    def post(self, approval_id: str):
        """Approve a pending approval request."""
        return _v1_approve(approval_id)


@blp.route("/<string:approval_id>/reject")
class RejectView(MethodView):
    @doc(
        responses={
            "200": json_response(ApprovalWriteOut, "Rejected approval record."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[
            path_param("approval_id", "Approval record id."),
            IDEMPOTENCY_KEY_PARAMETER,
            PROJECT_HEADER_PARAMETER,
        ],
        security=BEARER_SECURITY,
    )
    def post(self, approval_id: str):
        """Reject a pending approval request."""
        return _v1_reject(approval_id)
