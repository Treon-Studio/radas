"""v2: auth/token domain — login, refresh, me (Task 2.3).

Handlers delegate to the v1 view functions so runtime responses stay
byte-identical; the explicit schemas below replace the generic auto-proxy
rendering of these operations in the served ``/api/v2`` document.
"""
from __future__ import annotations

from typing import Any, Optional

from flask.views import MethodView
from flask_smorest import Blueprint
from pydantic import BaseModel, ConfigDict, Field

from api.auth_routes import (
    api_auth_login as _v1_login,
    api_auth_me as _v1_me,
    api_auth_refresh as _v1_refresh,
)

from ._doc import (
    BEARER_SECURITY,
    ERROR_ENVELOPE_RESPONSE,
    IDEMPOTENCY_KEY_PARAMETER,
    doc,
    json_response,
)

blp = Blueprint(
    "auth_v2",
    __name__,
    url_prefix="/api/v2/auth",
    description="Authentication: login, token refresh and session identity.",
)


# ---------- Request models ----------

class LoginIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=1024)


class RefreshIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    refresh_token: str = Field(min_length=1, max_length=4096)


# ---------- Response models ----------

class _UserRef(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    roles: Optional[list[str]] = None


class _MeUser(BaseModel):
    """The authenticated user's profile as returned by /auth/me."""

    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    roles: Optional[list[str]] = None
    role_details: Optional[list[dict[str, Any]]] = None
    permissions: Optional[list[str]] = None
    is_active: Optional[bool] = None
    created_at: Optional[Any] = None
    last_login: Optional[Any] = None


class LoginOut(BaseModel):
    """Successful login. The MFA challenge variant adds ``mfa_required`` and
    ``mfa_token`` and omits the token pair (documented via allowed extras)."""

    model_config = ConfigDict(extra="allow")
    success: bool = True
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    orgs: Optional[list[dict[str, Any]]] = None
    active_org_id: Optional[str] = None
    user: Optional[_UserRef] = None


class RefreshOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool = True
    access_token: str


class MeOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool = True
    user: _MeUser


# ---------- Routes ----------

@blp.route("/login")
class LoginView(MethodView):
    @doc(
        request_model=LoginIn,
        request_description="Username and password. MFA-enrolled users receive a short-lived mfa_token instead of a token pair.",
        responses={
            "200": json_response(
                LoginOut,
                "Token pair (or MFA challenge). Rate-limited, validation and "
                "credential failures return the error envelope.",
            ),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[IDEMPOTENCY_KEY_PARAMETER],
    )
    def post(self):
        """Exchange username and password for an access/refresh token pair."""
        return _v1_login()


@blp.route("/refresh")
class RefreshView(MethodView):
    @doc(
        request_model=RefreshIn,
        responses={
            "200": json_response(RefreshOut, "Fresh access token."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[IDEMPOTENCY_KEY_PARAMETER],
    )
    def post(self):
        """Exchange a valid refresh token for a fresh access token."""
        return _v1_refresh()


@blp.route("/me")
class MeView(MethodView):
    @doc(
        responses={
            "200": json_response(MeOut, "The authenticated user's profile, roles and permissions."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        security=BEARER_SECURITY,
    )
    def get(self):
        """Identity of the authenticated user (roles, permissions, activity)."""
        return _v1_me()
