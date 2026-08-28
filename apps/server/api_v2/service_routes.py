"""v2: services domain — instance list/get/create/update and operations (Task 2.3).

Handlers delegate to the v1 platform views so runtime responses stay
byte-identical; these operations already return the shared envelope contract
(``success_response`` / ``operation_response``), so the explicit success
statuses reference the shared ``SuccessEnvelope`` / ``OperationEnvelope``
component schemas (Task 2.2) instead of the generic auto-proxy rendering.

Poll URL note (Task 2.2 follow-up): service operations emit their
``poll_url`` as the v1-relative service-operation URL
(``/api/projects/{project_id}/services/{service_id}/operations/{operation_id}``)
from every namespace, including this v2 documentation — the description on
the shared ``Operation`` schema documents that; runtime URLs are unchanged.

Project/org security: operations are project-scoped (path ``project_id``);
the caller must belong to the organization owning the project
(``require_project_access``). Mutations require the ``Idempotency-Key``
header whenever they queue an operation (``deploy=true`` creates).
"""
from __future__ import annotations

from typing import Any, Optional

from flask.views import MethodView
from flask_smorest import Blueprint
from pydantic import BaseModel, ConfigDict, Field

from api.service_instance_routes import (
    create_service as _v1_create_service,
    get_service as _v1_get_service,
    list_service_operations as _v1_list_operations,
    list_services as _v1_list_services,
    patch_service as _v1_patch_service,
)

from ._doc import (
    BEARER_SECURITY,
    IDEMPOTENCY_KEY_PARAMETER,
    doc,
    envelope_ref_response,
    path_param,
)

_PROJECT_ID_PARAM = path_param("project_id", "Project id (org membership enforced).")
_SERVICE_ID_PARAM = path_param("service_id", "Service instance id.")
from .schemas.contracts import (
    ERROR_RESPONSE_DESCRIPTION,
    OPERATION_RESPONSE_DESCRIPTION,
    SUCCESS_RESPONSE_DESCRIPTION,
)

blp = Blueprint(
    "services_v2",
    __name__,
    url_prefix="/api/v2",
    description=(
        "Project-scoped service instances (catalog-driven) and their async "
        "operations. Success responses use the shared envelope schemas; "
        "operation poll_url values are the v1-relative service-operation URLs "
        "and are identical across namespaces."
    ),
)


# ---------- Request models ----------

class ServiceCreateIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = Field(min_length=1, max_length=200)
    environment: str = Field(description="Target environment (e.g. development, staging, production).")
    catalog_slug: str
    catalog_version: str
    runtime_id: str
    spec: dict[str, Any] = Field(default_factory=dict, description="Manifest-validated inputs.")
    deploy: Optional[bool] = Field(
        default=None,
        description="Queue an initial deploy after creation — requires the Idempotency-Key header; returns 202 OperationEnvelope.",
    )


class ServicePatchIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    spec: dict[str, Any] = Field(description="Complete replacement manifest-validated spec.")


# ---------- Routes ----------

@blp.route("/projects/<string:project_id>/services")
class ServicesView(MethodView):
    @doc(
        responses={
            "200": envelope_ref_response(
                "SuccessEnvelope",
                SUCCESS_RESPONSE_DESCRIPTION
                + " data: {services: [service instance view], org_id}.",
            ),
            "default": {
                "description": ERROR_RESPONSE_DESCRIPTION,
                "content": {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/ErrorEnvelope"}
                    }
                },
            },
        },
        parameters=[_PROJECT_ID_PARAM],
        security=BEARER_SECURITY,
    )
    def get(self, project_id: str):
        """List the project's service instances (optionally filtered)."""
        return _v1_list_services(project_id)

    @doc(
        request_model=ServiceCreateIn,
        request_description=(
            "Catalog definition + validated spec. Set deploy=true (with an "
            "Idempotency-Key header) to create and queue the initial deploy "
            "operation in one call."
        ),
        responses={
            "201": envelope_ref_response(
                "SuccessEnvelope",
                SUCCESS_RESPONSE_DESCRIPTION
                + " data: {service: detailed instance view}.",
            ),
            "202": envelope_ref_response(
                "OperationEnvelope",
                OPERATION_RESPONSE_DESCRIPTION
                + " Returned when deploy=true queues the initial deploy.",
            ),
            "default": {
                "description": ERROR_RESPONSE_DESCRIPTION,
                "content": {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/ErrorEnvelope"}
                    }
                },
            },
        },
        parameters=[
            {
                "name": "Idempotency-Key",
                "in": "header",
                "required": False,
                "schema": {"type": "string", "maxLength": 255},
                "description": (
                    "Required (1-255 chars) when the request sets deploy=true: "
                    "keys the queued operation for safe retries; reusing a key "
                    "replays the recorded response."
                ),
            },
            _PROJECT_ID_PARAM,
        ],
        security=BEARER_SECURITY,
    )
    def post(self, project_id: str):
        """Create a service instance (optionally queue its initial deploy)."""
        return _v1_create_service(project_id)


@blp.route("/projects/<string:project_id>/services/<string:service_id>")
class ServiceView(MethodView):
    @doc(
        responses={
            "200": envelope_ref_response(
                "SuccessEnvelope",
                SUCCESS_RESPONSE_DESCRIPTION
                + " data: {service: detailed instance view with desired revision}.",
            ),
            "default": {
                "description": ERROR_RESPONSE_DESCRIPTION,
                "content": {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/ErrorEnvelope"}
                    }
                },
            },
        },
        parameters=[_PROJECT_ID_PARAM, _SERVICE_ID_PARAM],
        security=BEARER_SECURITY,
    )
    def get(self, project_id: str, service_id: str):
        """Fetch one service instance with its desired revision."""
        return _v1_get_service(project_id, service_id)

    @doc(
        request_model=ServicePatchIn,
        request_description=(
            "Complete replacement spec validated against the catalog "
            "manifest; production instances additionally require a "
            "confirmation token."
        ),
        responses={
            "200": envelope_ref_response(
                "SuccessEnvelope",
                SUCCESS_RESPONSE_DESCRIPTION
                + " data: {service: detailed instance view}.",
            ),
            "202": envelope_ref_response(
                "OperationEnvelope",
                OPERATION_RESPONSE_DESCRIPTION
                + " Returned when the patch queues an update operation.",
            ),
            "default": {
                "description": ERROR_RESPONSE_DESCRIPTION,
                "content": {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/ErrorEnvelope"}
                    }
                },
            },
        },
        parameters=[
            path_param("project_id", "Project id (org membership enforced)."),
            path_param("service_id", "Service instance id."),
            IDEMPOTENCY_KEY_PARAMETER,
        ],
        security=BEARER_SECURITY,
    )
    def patch(self, project_id: str, service_id: str):
        """Update a service instance spec (may queue an update operation)."""
        return _v1_patch_service(project_id, service_id)


@blp.route("/projects/<string:project_id>/services/<string:service_id>/operations")
class ServiceOperationsView(MethodView):
    @doc(
        responses={
            "200": envelope_ref_response(
                "SuccessEnvelope",
                SUCCESS_RESPONSE_DESCRIPTION
                + " data: {operations: [service operation view]}. Operations "
                "carry their poll_url as the v1-relative service-operation URL "
                "(/api/projects/{project_id}/services/{service_id}/operations/"
                "{operation_id}); the same URL shape is emitted from every "
                "namespace and runtime URLs are unchanged — poll it as "
                "returned.",
            ),
            "default": {
                "description": ERROR_RESPONSE_DESCRIPTION,
                "content": {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/ErrorEnvelope"}
                    }
                },
            },
        },
        parameters=[_PROJECT_ID_PARAM, _SERVICE_ID_PARAM],
        security=BEARER_SECURITY,
    )
    def get(self, project_id: str, service_id: str):
        """List the async operations of a service instance."""
        return _v1_list_operations(project_id, service_id)
