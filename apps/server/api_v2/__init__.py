"""flask-smorest auto-generated OpenAPI docs at /api/v2/*.

**Required contract surface (Task 2.1 of the 2026-08-27 console–CLI plan).**
``/api/v2`` is the forward-facing API contract consumed by the console and
CLI. flask-smorest is a pinned server dependency (``requirements.txt``); a
failed mount or finalize **raises** instead of silently disabling v2, and the
failure is recorded on ``app.extensions`` under
:data:`V2_SURFACE_EXTENSION_KEY` so ``/readyz`` reports
``v2_contract_ok=False``. Legacy ``/api/*`` and ``/api/docs`` stay
byte-identical.

Two-tier strategy:

1. **Manual conversions** — hand-written flask-smorest MethodView blueprints
   with rich marshmallow/pydantic schemas (yaml_v2, roles_usage_v2,
   api_tokens_v2, queue_search_v2). Registered eagerly during
   ``init_api_v2``.
2. **Auto-proxy** — for every remaining ``/api/*`` route, we scan the app's
   URL map (via ``finalize_api_v2`` called near the end of ``app.py``) and
   mount a mirrored ``/api/v2/*`` proxy on a flask-smorest ``Blueprint``.
   Docs appear automatically; runtime behavior is delegated to the v1 view
   function.

After the auto-proxies are mounted, ``finalize_api_v2`` stamps a stable,
unique ``operationId`` onto every operation (flask-smorest generates none by
default) so clients can reference operations durably.
"""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from flask import Flask

logger = logging.getLogger(__name__)

#: Stable ``info.version`` of the served OpenAPI document. Bump deliberately:
#: console/CLI gate their contract binding on this value.
API_V2_INFO_VERSION = "v2"

#: OpenAPI document version served at ``/api/v2/openapi.json``.
API_V2_OPENAPI_VERSION = "3.1.0"

#: ``app.extensions`` key holding the mount state consumed by readiness.
V2_SURFACE_EXTENSION_KEY = "radas_v2_surface"

_API_EXTENSION_KEY = "radas_v2_api"
_FINALIZED_EXTENSION_KEY = "radas_v2_finalized"

#: HTTP methods that carry a stamped operationId in the served document.
_OPERATION_METHODS = frozenset({"get", "post", "put", "patch", "delete", "head", "options", "trace"})


def _record_surface_state(
    app: Any, *, ok: bool, phase: str, error_type: str | None = None
) -> None:
    """Publish the v2 mount state on ``app.extensions`` for readiness."""
    app.extensions[V2_SURFACE_EXTENSION_KEY] = {
        "ok": bool(ok),
        "phase": phase,
        "error_type": error_type,
    }


def v2_surface_ok(app: Any | None = None) -> bool:
    """True when the /api/v2 contract surface mounted and finalized on app.

    Missing evidence is reported healthy — the same policy as
    ``api.route_inventory.required_blueprints_ok``: the flag exists to
    convert *observed* mount/finalize failures into unhealthy readiness,
    not to guess about processes that never ran ``init_api_v2`` (unit-test
    probe apps, management commands, …).
    """
    if app is None:
        try:
            from flask import current_app

            app = current_app._get_current_object()  # noqa: SLF001
        except Exception:
            return True
    state = (getattr(app, "extensions", None) or {}).get(V2_SURFACE_EXTENSION_KEY)
    if state is None:
        return True
    return bool(state.get("ok")) and not state.get("error_type")


def _fail_mount(app: Any, phase: str, exc: Exception, message: str) -> RuntimeError:
    """Record the unhealthy state then raise the fail-closed error."""
    _record_surface_state(app, ok=False, phase=phase, error_type=type(exc).__name__)
    return RuntimeError(f"{message}: {exc}")


def _register_manual_blueprints(api) -> None:
    """Register hand-converted v2 blueprints with rich schemas.

    These blueprints are part of the required contract surface: a failure
    raises instead of degrading the document silently.
    """
    registrations = (
        ("api_v2.yaml_routes", "blp"),
        ("api_v2.roles_usage_routes", "blp"),
        ("api_v2.api_tokens_routes", "blp"),
        ("api_v2.queue_search_routes", "blp"),
    )
    failures: list[str] = []
    for module_path, attr in registrations:
        try:
            module = __import__(module_path, fromlist=[attr])
            api.register_blueprint(getattr(module, attr))
        except Exception as e:
            failures.append(module_path)
            logger.error("Failed to register %s: %s", module_path, e, exc_info=True)
    if failures:
        raise RuntimeError(
            "Required v2 blueprints failed to register: " + ", ".join(sorted(failures))
        )


def init_api_v2(app: "Flask") -> None:
    """Attach the flask-smorest Api and register manual blueprints.

    Call ``finalize_api_v2(app)`` near the end of ``app.py`` (after every
    ``@app.route`` and blueprint route is defined) to mount auto-proxies for
    the remaining v1 endpoints and stamp stable operation IDs.

    Raises:
        RuntimeError: when flask-smorest is unavailable, the Api cannot be
            created, or a required v2 blueprint fails — the contract surface
            must never silently disappear. The unhealthy state is recorded
            on ``app.extensions`` before raising so readiness can report it.
    """
    # Fail closed from the first line: any failure below leaves an explicit
    # unhealthy state on extensions, whatever app.py decides to log.
    _record_surface_state(app, ok=False, phase="init")
    try:
        from flask_smorest import Api
    except Exception as e:
        raise _fail_mount(
            app,
            "init",
            e,
            "flask-smorest is required for the /api/v2 contract surface "
            "(pinned in apps/server/requirements.txt); /api/v2 cannot be "
            "served without it",
        ) from e

    app.config.setdefault("API_TITLE", "OpenSible API (v2)")
    app.config.setdefault("API_VERSION", API_V2_INFO_VERSION)
    app.config.setdefault("OPENAPI_VERSION", API_V2_OPENAPI_VERSION)
    app.config.setdefault("OPENAPI_URL_PREFIX", "/api/v2")
    app.config.setdefault("OPENAPI_JSON_PATH", "openapi.json")
    app.config.setdefault("OPENAPI_SWAGGER_UI_PATH", "docs")
    app.config.setdefault(
        "OPENAPI_SWAGGER_UI_URL",
        "https://unpkg.com/swagger-ui-dist@5.9.0/",
    )

    try:
        api = Api(app)
    except Exception as e:
        raise _fail_mount(
            app, "init", e, "Failed to init flask-smorest Api for /api/v2"
        ) from e

    # Shared BearerAuth security scheme so @blp.doc(security=...) resolves.
    try:
        from ._common import apply_security
        apply_security(api)
    except Exception as e:
        raise _fail_mount(
            app, "init", e, "Failed to apply v2 security scheme"
        ) from e

    try:
        _register_manual_blueprints(api)
    except Exception as e:
        raise _fail_mount(
            app, "init", e, "Required v2 blueprint registration failed"
        ) from e
    # Per-app (not module-global) so multiple Flask apps in one process —
    # production boot plus unit tests — never finalize against the wrong Api.
    app.extensions[_API_EXTENSION_KEY] = api
    _record_surface_state(app, ok=False, phase="mounted")


def _derive_operation_id(method: str, path: str) -> str:
    """Deterministic operationId for a v2 operation: ``<method>_<path slug>``.

    Unique by construction (method + path identify the operation) and stable
    across boots because it depends only on the mounted URL surface.
    """
    suffix = path[len("/api/v2"):] or "_index"
    slug = re.sub(r"[^A-Za-z0-9]+", "_", suffix).strip("_").lower()
    return f"{method.lower()}_{slug}"


def _apply_stable_operation_ids(api) -> int:
    """Stamp missing ``operationId``s into the APISpec and verify uniqueness.

    flask-smorest 0.47 renders no operation IDs at all; console/CLI need
    durable operation references, so every operation gets a derived ID
    (explicit IDs are preserved) and duplicates fail closed.
    """
    paths = getattr(api.spec, "_paths", None)
    if not isinstance(paths, dict):
        raise RuntimeError(
            "flask-smorest APISpec internals changed (_paths missing); "
            "cannot stamp stable operationIds for the /api/v2 contract"
        )
    seen: dict[str, str] = {}
    stamped = 0
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if str(method).lower() not in _OPERATION_METHODS or not isinstance(operation, dict):
                continue
            operation_id = operation.get("operationId") or _derive_operation_id(str(method), path)
            owner = seen.get(operation_id)
            if owner is not None and owner != path:
                raise RuntimeError(
                    f"Duplicate OpenAPI operationId {operation_id!r} "
                    f"({owner} and {str(method).upper()} {path})"
                )
            operation["operationId"] = operation_id
            seen[operation_id] = path
            stamped += 1
    return stamped


def finalize_api_v2(app: "Flask") -> None:
    """Scan the completed URL map, mount /api/v2/* auto-proxies and stamp
    stable operation IDs into the served document.

    Must be called after every v1 route (blueprints + @app.route handlers)
    has been registered — typically near the bottom of ``app.py``, just
    before ``if __name__ == '__main__':``. Raises on failure (required
    surface); safe to call once per app.
    """
    if app.extensions.get(_FINALIZED_EXTENSION_KEY):
        return
    api = app.extensions.get(_API_EXTENSION_KEY)
    if api is None:
        _record_surface_state(app, ok=False, phase="finalize", error_type="RuntimeError")
        raise RuntimeError(
            "finalize_api_v2: init_api_v2 did not mount the /api/v2 contract surface"
        )
    try:
        from .auto_register import register_auto_proxies
        register_auto_proxies(api, app)
    except Exception as e:
        _record_surface_state(app, ok=False, phase="finalize", error_type=type(e).__name__)
        raise RuntimeError(f"/api/v2 auto-proxy finalize failed: {e}") from e

    try:
        _apply_stable_operation_ids(api)
    except RuntimeError:
        _record_surface_state(app, ok=False, phase="finalize", error_type="RuntimeError")
        raise

    app.extensions[_FINALIZED_EXTENSION_KEY] = True
    _record_surface_state(app, ok=True, phase="finalized")
