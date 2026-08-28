"""v2: worker domain — registry list/registration and worker protocol (Task 2.3).

Handlers delegate to the v1 view functions so runtime responses stay
byte-identical; the explicit schemas below replace the generic auto-proxy
rendering of these operations in the served ``/api/v2`` document.

Worker security: ``/api/v2/worker/*`` operations authenticate with the
worker registry token (Bearer) — the same protocol as the legacy
``/api/worker/*`` paths; ``/api/v2/admin/workers`` requires a user JWT and
exposes the registry to admin consoles and the CLI.
"""
from __future__ import annotations

from typing import Any, Optional

from flask.views import MethodView
from flask_smorest import Blueprint
from pydantic import BaseModel, ConfigDict, Field

from api.admin_routes import (
    api_admin_create_worker as _v1_admin_create_worker,
    api_admin_list_workers as _v1_admin_list_workers,
)
from api.worker_routes import (
    api_worker_claim as _v1_worker_claim,
    api_worker_execution_finish as _v1_worker_finish,
    api_worker_heartbeat as _v1_worker_heartbeat,
)

from ._doc import (
    BEARER_SECURITY,
    ERROR_ENVELOPE_RESPONSE,
    IDEMPOTENCY_KEY_PARAMETER,
    doc,
    json_response,
    path_param,
)

blp = Blueprint(
    "workers_v2",
    __name__,
    url_prefix="/api/v2",
    description="Worker registry (admin) and worker claim/heartbeat/finish protocol.",
)


# ---------- Request models ----------

class AdminWorkerCreateIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = Field(min_length=1, max_length=200)
    capabilities: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class WorkerClaimIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    projectId: Optional[str] = None
    maxConcurrency: Optional[int] = Field(default=None, ge=1, le=64)
    tags: Optional[list[str]] = None
    recovering: Optional[bool] = None


class WorkerFinishIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    status: str = Field(description="SUCCESS | FAILED | CANCELED")
    finishedAt: Optional[float] = None
    duration: Optional[float] = None
    returnCode: Optional[int] = None
    error: Optional[str] = None
    result: Optional[dict[str, Any]] = None


# ---------- Response models ----------

class WorkerInfo(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    name: Optional[str] = None
    enabled: Optional[bool] = None
    capabilities: Optional[dict[str, Any]] = None
    tags: Optional[list[str]] = None
    lastSeenAt: Optional[float] = None
    currentExecutionId: Optional[str] = None


class WorkersOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool = True
    workers: list[WorkerInfo]


class AdminWorkerCreateOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool = True
    workerId: str
    workerToken: str = Field(description="Plaintext worker token. Shown only once.")
    message: str


class HeartbeatOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool = True
    workerId: str
    requestSystemInfo: bool


class WorkerFinishOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    success: bool = True


# ---------- Routes ----------

@blp.route("/admin/workers")
class AdminWorkersView(MethodView):
    @doc(
        responses={
            "200": json_response(WorkersOut, "All registered workers with registry state."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        security=BEARER_SECURITY,
    )
    def get(self):
        """List registered workers (registry + last-seen state)."""
        return _v1_admin_list_workers()

    @doc(
        request_model=AdminWorkerCreateIn,
        responses={
            "200": json_response(
                AdminWorkerCreateOut,
                "Created worker registration; the plaintext token is returned only once.",
            ),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[IDEMPOTENCY_KEY_PARAMETER],
        security=BEARER_SECURITY,
    )
    def post(self):
        """Register a worker and obtain its one-time worker token."""
        return _v1_admin_create_worker()


@blp.route("/worker/heartbeat")
class WorkerHeartbeatView(MethodView):
    @doc(
        request_model={
            "type": "object",
            "additionalProperties": True,
            "properties": {
                "currentExecutionId": {
                    "type": "string",
                    "description": "Execution or service operation the worker is running (lease is renewed for service operations).",
                },
                "leaseToken": {"type": "string", "description": "Lease token for service-operation heartbeats."},
            },
        },
        responses={
            "200": json_response(HeartbeatOut, "Heartbeat recorded; requestSystemInfo tells the worker to report host info."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[IDEMPOTENCY_KEY_PARAMETER],
        security=BEARER_SECURITY,
    )
    def post(self):
        """Worker liveness heartbeat (worker-token authenticated)."""
        return _v1_worker_heartbeat()


@blp.route("/worker/claim")
class WorkerClaimView(MethodView):
    @doc(
        request_model=WorkerClaimIn,
        request_description=(
            "Claim parameters: project filter, concurrency cap and tag "
            "matching. Service operations share this claim endpoint."
        ),
        responses={
            "200": json_response(
                {
                    "type": "object",
                    "additionalProperties": True,
                    "required": ["success", "executionId", "projectId"],
                    "properties": {
                        "success": {"type": "boolean"},
                        "executionId": {"type": "string"},
                        "projectId": {"type": "string"},
                        "playbookId": {"type": ["string", "null"]},
                        "runParams": {"type": "object"},
                        "queuedAt": {"type": ["number", "string", "null"]},
                        "createdAt": {"type": ["number", "string", "null"]},
                        "kind": {
                            "type": "string",
                            "description": "service_operation claims carry this marker plus a serviceOperation payload.",
                        },
                        "serviceOperation": {"type": "object"},
                    },
                },
                "Claimed execution (legacy playbook run) or service operation.",
            ),
            "204": {"description": "No queued execution available (worker stays idle)."},
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[IDEMPOTENCY_KEY_PARAMETER],
        security=BEARER_SECURITY,
    )
    def post(self):
        """Claim the next queued execution or service operation."""
        return _v1_worker_claim()


@blp.route("/worker/executions/<string:execution_id>/finish")
class WorkerFinishView(MethodView):
    @doc(
        request_model=WorkerFinishIn,
        responses={
            "200": json_response(WorkerFinishOut, "Finish recorded (service operations return the finished operation)."),
            "default": ERROR_ENVELOPE_RESPONSE,
        },
        parameters=[
            path_param("execution_id", "Execution or service-operation id."),
            IDEMPOTENCY_KEY_PARAMETER,
        ],
        security=BEARER_SECURITY,
    )
    def post(self, execution_id: str):
        """Finish a claimed execution with a terminal status."""
        return _v1_worker_finish(execution_id)
