"""Documentation helpers for the explicit v2 domain blueprints (Task 2.3).

The explicit domain blueprints (auth, org/project, cloud stack, flags,
approvals, workers, services, search) delegate to the v1 view functions so
runtime responses stay byte-identical to the legacy API, while the served
``/api/v2`` document gains explicit request/response schemas, path/header
parameters, security requirements and ``Idempotency-Key`` parameters on
mutations — replacing the generic auto-proxy rendering.

Everything in this module only shapes the *document* (flask-smorest
``manual_doc`` channel): no runtime validation, serialization or behavior
change is introduced here, so the v2 mirrors remain faithful proxies.
"""
from __future__ import annotations

from functools import wraps
from typing import Any, Callable, Mapping, Type

from pydantic import BaseModel

#: Default error response of every contract operation: the structured shared
#: envelope (Task 2.2). True at runtime — ``/api/v2/*`` errors are normalized
#: to ``ErrorEnvelope`` by the platform-contract finalizer.
ERROR_ENVELOPE_RESPONSE: dict[str, Any] = {
    "description": (
        "Structured error envelope: stable machine-readable code, human-readable "
        "message and machine-readable details. Credential material is redacted "
        "to [REDACTED]; retryability appears only as a boolean or category token."
    ),
    "content": {
        "application/json": {
            "schema": {"$ref": "#/components/schemas/ErrorEnvelope"}
        }
    },
}

BEARER_SECURITY: list[dict[str, Any]] = [{"BearerAuth": []}]

#: Opt-in idempotency replay header honored by the platform-contract
#: middleware for every POST under the contract namespaces (``/api/v2/*``):
#: the same key + identical body replays the recorded response; the same key
#: with a different payload is rejected with 409 CONFLICT.
IDEMPOTENCY_KEY_PARAMETER: dict[str, Any] = {
    "name": "Idempotency-Key",
    "in": "header",
    "required": False,
    "schema": {"type": "string", "maxLength": 255},
    "description": (
        "Optional idempotency key for POST replay protection on the contract "
        "namespace: repeating a POST with the same key and an identical body "
        "replays the recorded response, while reusing a key with a different "
        "body is rejected with 409 CONFLICT. Some operations additionally "
        "require this header at runtime (described per operation)."
    ),
}

#: Project scoping header honored by ``require_project_access`` (header is
#: preferred; ``?project_id=`` query and JSON body ``project_id`` are also
#: accepted — the first source that resolves wins).
PROJECT_HEADER_PARAMETER: dict[str, Any] = {
    "name": "X-Project-Id",
    "in": "header",
    "required": False,
    "schema": {"type": "string"},
    "description": (
        "Project scoping for project-tenant operations (preferred over the "
        "``project_id`` query/body source). The authenticated user must be a "
        "member of the organization owning the project; cross-tenant access "
        "is rejected with 403."
    ),
}


def path_param(name: str, description: str) -> dict[str, Any]:
    """Documented, required path parameter (flask-smorest does not add these)."""
    return {
        "name": name,
        "in": "path",
        "required": True,
        "schema": {"type": "string"},
        "description": description,
    }


def query_param(
    name: str,
    description: str,
    *,
    required: bool = False,
    schema: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "in": "query",
        "required": required,
        "schema": schema or {"type": "string"},
        "description": description,
    }


def model_json_schema(model: Type[BaseModel]) -> dict[str, Any]:
    """OpenAPI-shaped JSON schema for a pydantic model (component refs)."""
    return model.model_json_schema(ref_template="#/components/schemas/{model}")


def json_response(
    schema: Mapping[str, Any] | Type[BaseModel], description: str
) -> dict[str, Any]:
    """Build an OpenAPI response object from a schema dict or pydantic model."""
    body_schema = (
        {"$ref": f"#/components/schemas/{schema}"}
        if isinstance(schema, str)
        else model_json_schema(schema)
        if isinstance(schema, type) and issubclass(schema, BaseModel)
        else dict(schema)
    )
    return {
        "description": description,
        "content": {"application/json": {"schema": body_schema}},
    }


def envelope_ref_response(component: str, description: str) -> dict[str, Any]:
    """Response documented as one of the shared envelope component schemas."""
    return json_response(component, description)


def doc(
    *,
    responses: dict[str, dict[str, Any]] | None = None,
    parameters: list[dict[str, Any]] | None = None,
    request_model: Type[BaseModel] | None = None,
    request_description: str | None = None,
    security: list[dict[str, Any]] | None = None,
) -> Callable:
    """Attach explicit OpenAPI documentation to a v2 MethodView handler.

    Writes flask-smorest's ``manual_doc`` channel (the same one ``@blp.doc``
    uses) so the rendered operation carries the explicit schemas. Handlers
    keep delegating to v1 views untouched — nothing here validates or
    transforms runtime payloads.
    """
    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any):
            return fn(*args, **kwargs)

        apidoc = getattr(wrapper, "_apidoc", {}) or {}
        manual = apidoc.setdefault("manual_doc", {})
        if responses:
            manual.setdefault("responses", {}).update(responses)
        if parameters:
            manual.setdefault("parameters", []).extend(parameters)
        if request_model is not None:
            body_schema = (
                request_model
                if isinstance(request_model, dict)
                else model_json_schema(request_model)
            )
            manual["requestBody"] = {
                "required": True,
                "description": request_description,
                "content": {
                    "application/json": {"schema": body_schema}
                },
            }
        if security is not None:
            manual["security"] = security
        wrapper._apidoc = apidoc  # noqa: SLF001 - flask-smorest doc channel
        return wrapper

    return decorator
