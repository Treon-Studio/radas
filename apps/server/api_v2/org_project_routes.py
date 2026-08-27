"""v2: org/project domain — org list/create, project list/create, org switch.

Handlers delegate to the v1 view functions so runtime responses stay
byte-identical; the explicit schemas below replace the generic auto-proxy
rendering of these operations in the served ``/api/v2`` document.

Org/project security: list/create resolve the caller's organization
memberships from PostgreSQL (``orgs``/``org_members``); projects are
org-scoped and a requested ``org_id`` must be one of the caller's orgs.
"""
from __future__ import annotations

from typing import Any, Optional

from flask.views import MethodView
from flask_smorest import Blueprint
from pydantic import BaseModel, ConfigDict, Field

from api.auth_routes import api_auth_switch_org as _v1_switch_org
from api.org_routes import (
    api_create_org as _v1_create_org,
    api_list_orgs as _v1_list_orgs,
)
from api.projects_routes import (
    api_create_project as _v1_create_project,
    api_list_projects as _v1_list_projects,
)

from ._doc import (
    BEARER_SECURITY,
    ERROR_ENVELOPE_RESPONSE,
    IDEMPOTENCY_KEY_PARAMETER,
    doc,
    json_response,
)

blp = Blueprint(
    "org_project_v2",
    __name__,
    url_prefix="/api/v2",
    description="Multi-tenant organizations and org-scoped projects.",
)


# ---------- Request models ----------

class CreateOrgIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = Field(min_length=1, max_length=200)


class CreateProjectIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    org_id: Optional[str] = Field(
        default=None,
        description="Owning organization; must be one of the caller's orgs "
        "(defaults to the caller's first org).",
    )


class SwitchOrgIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    org_id: str = Field(min_length=1, max_length=200)


# ---------- Response models ----------

class OrgsOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    orgs: list[dict[str, Any]]


class OrgCreateOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool = True
    org: dict[str, Any]


class ProjectsOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool = True
    projects: list[dict[str, Any]]


class ProjectWriteOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool = True
    project: Optional[dict[str, Any]] = None


class SwitchOrgOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool = True
    access_token: str
    refresh_token: str
    active_org_id: str


# ---------- Routes ----------

@blp.route("/orgs")
class OrgsView(MethodView):
    @doc(
        responses={
            "200": json_response(OrgsOut, "Organizations the authenticated user belongs to."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        security=BEARER_SECURITY,
    )
    def get(self):
        """List the organizations of the authenticated user."""
        return _v1_list_orgs()

    @doc(
        request_model=CreateOrgIn,
        responses={
            "201": json_response(OrgCreateOut, "Created organization with the caller as owner."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[IDEMPOTENCY_KEY_PARAMETER],
        security=BEARER_SECURITY,
    )
    def post(self):
        """Create an organization owned by the authenticated user."""
        return _v1_create_org()


@blp.route("/projects")
class ProjectsView(MethodView):
    @doc(
        responses={
            "200": json_response(
                ProjectsOut,
                "Projects visible to the user: every project of their "
                "organizations (archived ones only with include_archived=true).",
            ),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        security=BEARER_SECURITY,
        parameters=[
            {
                "name": "include_archived",
                "in": "query",
                "required": False,
                "schema": {"type": "boolean"},
                "description": "Include archived projects when true.",
            }
        ],
    )
    def get(self):
        """List org-visible projects (multi-tenant scoped)."""
        return _v1_list_projects()

    @doc(
        request_model=CreateProjectIn,
        responses={
            "200": json_response(ProjectWriteOut, "Created project (empty, deterministic layout)."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[IDEMPOTENCY_KEY_PARAMETER],
        security=BEARER_SECURITY,
    )
    def post(self):
        """Create an org-scoped project for the authenticated user."""
        return _v1_create_project()


@blp.route("/auth/switch-org")
class SwitchOrgView(MethodView):
    @doc(
        request_model=SwitchOrgIn,
        responses={
            "200": json_response(
                SwitchOrgOut,
                "Fresh access/refresh tokens carrying the new active org id.",
            ),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[IDEMPOTENCY_KEY_PARAMETER],
        security=BEARER_SECURITY,
    )
    def post(self):
        """Switch the active organization: re-issues org-bound tokens."""
        return _v1_switch_org()
