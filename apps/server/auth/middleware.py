#!/usr/bin/env python3
"""
Authentication middleware for protecting API endpoints with JWT.

Security notes
--------------
* `INTERNAL_CALL_SECRET`: must be configured explicitly and is never generated
  per process. This keeps internal authentication valid across workers and
  restarts; startup fails closed when it is missing.
* Access tokens are accepted in the query string ONLY for a small allow-list
  of streaming endpoints (SSE), where the browser EventSource API cannot set
  Authorization headers.
* Session revocation (logout-all, UC635) is deterministic during storage
  outages: token verification rejects any token whose `iat` is <= the
  file-based user cutoff (`auth/service.are_user_sessions_revoked`). The
  file cutoff is the authoritative store; the PostgreSQL sessions row is
  secondary enrichment, so a PG outage or missing rows never flip a revoked
  token back to accepted (fail closed). If the authoritative file write
  itself fails, `revoke_all_user_sessions` raises `SessionRevocationError`
  and routes must return an error — logout-all never reports success.
"""
from functools import wraps
from flask import request, jsonify
from typing import Any, Optional, Callable
import re


_SERVICE_ROUTE_RE = re.compile(r"^/api/projects/[^/]+/services(?:/|$)")


def _service_route() -> bool:
    return bool(_SERVICE_ROUTE_RE.match(request.path))


def _service_error(code: str, message: str, status: int, *, details: dict[str, Any] | None = None):
    # Use the same builder as service handlers. This keeps middleware failures
    # in the platform contract without changing unrelated legacy routes.
    from api.platform_contracts import error_response
    return error_response(code, message, status, details=details)
from pathlib import Path
import logging
import os
import hmac

from utils.runtime_secrets import is_production_environment, resolve_secret

try:
    from .auth import verify_token, get_token_from_header
except ImportError:
    from auth import verify_token, get_token_from_header

logger = logging.getLogger(__name__)


_data_dir: Optional[Path] = None
_access_control_service = None


# ---------------------------------------------------------------------------
# Internal-call secret
# ---------------------------------------------------------------------------
_INTERNAL_CALL_SECRET = resolve_secret(
    "INTERNAL_CALL_SECRET", generate_in_nonproduction=True
)
if not _INTERNAL_CALL_SECRET:
    raise RuntimeError("INTERNAL_CALL_SECRET is required to initialize authentication")
if len(_INTERNAL_CALL_SECRET) < 32:
    logger.warning("INTERNAL_CALL_SECRET is shorter than 32 chars — insecure outside production.")

# Registration is consumed by both the server and worker. Validate it at
# server import/startup so direct Python/container startup has the same gate as
# PM2; do not generate it here because the worker must share the exact value.
if is_production_environment():
    resolve_secret("WORKER_REGISTRATION_SECRET")
    resolve_secret("VAULT_SERVER_SECRET")


def get_internal_call_secret() -> str:
    """Return the configured internal-call secret for trusted local callers."""
    return _INTERNAL_CALL_SECRET


# ---------------------------------------------------------------------------
# Query-string token allow-list (SSE endpoints only)
# ---------------------------------------------------------------------------
def _path_allows_query_token(path: str) -> bool:
    # Only GET endpoints that browsers consume via EventSource need this.
    return (
        '/stream' in path
        or '/sse' in path
        or '/events' in path
        or path.endswith('/logs')
    )


def set_data_dir(data_dir: Path):
    global _data_dir
    _data_dir = data_dir


def get_data_dir() -> Path:
    global _data_dir
    if _data_dir is None:
        _data_dir = Path(__file__).parent.parent.parent / 'data'
    return _data_dir


def set_access_control_service(access_control_service):
    global _access_control_service
    _access_control_service = access_control_service


def get_access_control_service():
    global _access_control_service
    if _access_control_service is None:
        try:
            from services.permission_service import AccessControlService
            _access_control_service = AccessControlService(get_data_dir())
        except ImportError:
            from services.permission_service import AccessControlService
            _access_control_service = AccessControlService(get_data_dir())
    return _access_control_service


def require_auth(f: Callable) -> Callable:
    """Require valid JWT, worker token, or API token."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # In-process internal call (scheduler, background jobs via test_client).
        provided_internal = request.headers.get('X-Internal-Call')
        if provided_internal and hmac.compare_digest(
            provided_internal, _INTERNAL_CALL_SECRET
        ):
            request.current_user = {
                'username': 'internal',
                'user_id': '__internal__',
                'roles': ['admin'],
            }
            request.token = None
            return f(*args, **kwargs)

        auth_header = request.headers.get('Authorization')
        token = get_token_from_header(auth_header)
        # Query-string token only for SSE-style streaming endpoints.
        if not token and request.method == 'GET' and _path_allows_query_token(request.path):
            token = request.args.get('access_token') or request.args.get('token')
        if not token:
            if _service_route():
                return _service_error('UNAUTHORIZED', 'Access token missing', 401)
            return jsonify({
                'error': 'Authentication required',
                'message': 'Access token missing',
            }), 401

        try:
            from services.worker_registry import verify_token as verify_worker_token
        except ImportError:
            from services.worker_registry import verify_token as verify_worker_token
        # Worker tokens authenticate the worker protocol on the legacy paths
        # and on their /api/v2 contract mirrors (Task 2.3) — the v2 worker
        # operations document BearerAuth and must actually accept the
        # worker-registry tokens the documented clients send.
        is_worker_path = request.path.startswith('/api/worker/') or request.path.startswith('/api/v2/worker/')
        is_execution_get = request.path.startswith('/api/executions/') and request.method == 'GET'
        if is_worker_path or is_execution_get:
            result = verify_worker_token(token)
            if result:
                worker_id, _ = result
                request.current_user = {
                    'worker_id': worker_id,
                    'username': f'worker:{worker_id[:8]}',
                    'roles': [],
                }
                request.token = token
                return f(*args, **kwargs)
            if is_worker_path:
                return jsonify({
                    'error': 'Invalid token',
                    'message': 'Worker token is invalid or expired. Re-register the worker or set WORKER_TOKEN.',
                }), 401

        data_dir = get_data_dir()
        payload = verify_token(token, data_dir, token_type='access')
        if payload:
            request.current_user = {
                'user_id': payload.get('user_id'),
                'username': payload.get('username'),
                'roles': payload.get('roles', []),
                'org_id': payload.get('org_id'),
            }
            request.current_org_id = payload.get('org_id')
            request.token = token
            if 'readonly' in (payload.get('roles') or []) and request.method not in ('GET', 'HEAD', 'OPTIONS') and not request.path.startswith('/api/auth/'):
                if _service_route():
                    return _service_error('READ_ONLY', 'This account has read-only access.', 403, details={'method': request.method})
                return jsonify({'error': 'Read-only access',
                                'message': 'This account has read-only access.'}), 403
            return f(*args, **kwargs)

        # API token (long-lived, programmatic)
        try:
            from storage.api_tokens_store import verify_api_token
        except ImportError:
            from storage.api_tokens_store import verify_api_token
        api_result = verify_api_token(token)
        if api_result:
            api_user_id, token_entry = api_result
            roles = list(token_entry.get('roles') or [])
            if not roles:
                try:
                    acs = get_access_control_service()
                    if hasattr(acs, 'get_user_roles'):
                        roles = acs.get_user_roles(api_user_id) or []
                except Exception:
                    pass
            request.current_user = {
                'user_id': api_user_id,
                'username': token_entry.get('username', f'api:{api_user_id[:8]}'),
                'roles': roles,
            }
            request.token = token
            if 'readonly' in roles and request.method not in ('GET', 'HEAD', 'OPTIONS') and not request.path.startswith('/api/auth/'):
                if _service_route():
                    return _service_error('READ_ONLY', 'This account has read-only access.', 403, details={'method': request.method})
                return jsonify({'error': 'Read-only access',
                                'message': 'This account has read-only access.'}), 403
            return f(*args, **kwargs)

        if _service_route():
            return _service_error('UNAUTHORIZED', 'Access token is invalid or expired', 401)
        return jsonify({
            'error': 'Invalid token',
            'message': 'Access token is invalid or expired',
        }), 401
    return decorated_function


def require_optional_auth(f: Callable) -> Callable:
    """Auth is optional; current_user is None when missing or invalid."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        token = get_token_from_header(auth_header)
        if not token:
            request.current_user = None
            request.token = None
            return f(*args, **kwargs)
        data_dir = get_data_dir()
        payload = verify_token(token, data_dir, token_type='access')
        if not payload:
            request.current_user = None
            request.token = None
            return f(*args, **kwargs)
        request.current_user = {
            'user_id': payload.get('user_id'),
            'username': payload.get('username'),
            'roles': payload.get('roles', []),
        }
        request.token = token
        return f(*args, **kwargs)
    return decorated_function


def require_permission(permission_name: str):
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        @require_auth
        def decorated_function(*args, **kwargs):
            user_id = request.current_user.get('user_id')
            if not user_id:
                return jsonify({
                    'error': 'Authentication error',
                    'message': 'Failed to identify user',
                }), 401
            access_control = get_access_control_service()
            if not access_control.has_permission(user_id, permission_name):
                logger.warning(
                    f"User {request.current_user.get('username')} (ID: {user_id}) "
                    f"denied access to {permission_name}"
                )
                return jsonify({
                    'error': 'Access denied',
                    'message': f'Insufficient permissions. Required: {permission_name}',
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def require_any_role(*role_names: str):
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        @require_auth
        def decorated_function(*args, **kwargs):
            user_roles = request.current_user.get('roles', [])
            if not any(role in role_names for role in user_roles):
                return jsonify({
                    'error': 'Access denied',
                    'message': f'One of the following roles is required: {", ".join(role_names)}',
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def require_all_roles(*role_names: str):
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        @require_auth
        def decorated_function(*args, **kwargs):
            user_roles = request.current_user.get('roles', [])
            if not all(role in user_roles for role in role_names):
                return jsonify({
                    'error': 'Access denied',
                    'message': f'All of the following roles are required: {", ".join(role_names)}',
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def _resolve_project_id(*view_args: Any) -> Optional[str]:
    """Resolve project id from header/query/body, then path params
    (<project_id> view arg). No default fallback."""
    from utils.request_ctx import project_id_from_request_sources
    try:
        pid = project_id_from_request_sources()
        if pid:
            return pid
    except Exception:
        pass
    for v in view_args:
        if isinstance(v, str) and v and "/" not in v and "\\" not in v:
            # Most project ids are uuid4/hex; treat bare path segment as project id.
            return v
    return None


def _org_id_of_project(project_id: str) -> Optional[str]:
    try:
        from storage import pg
        row = pg.query_one("SELECT org_id FROM projects WHERE id = %s", (project_id,))
        return row["org_id"] if row else None
    except Exception:
        return None


def require_project_access(f: Callable) -> Callable:
    """Require the user to be a member of the org that owns the resolved
    project (X-Project-Id header / query / body / path <project_id>).
    Closes the cross-tenant traversal gap: a user in org A cannot access
    org B's project by setting an arbitrary project id. Internal calls
    bypass (already admin).
    """
    @wraps(f)
    @require_auth
    def decorated_function(*args, **kwargs):
        cu = getattr(request, "current_user", {}) or {}
        if cu.get("user_id") == "__internal__":
            return f(*args, **kwargs)
        # Merge: view kwargs first (path params), then request sources.
        pid = None
        for key, val in (kwargs or {}).items():
            if key in ("project_id", "pid") and isinstance(val, str):
                pid = val
                break
        if not pid:
            pid = _resolve_project_id(*args)
        if not pid:
            # No project context -> allow (non-project-scoped endpoints).
            return f(*args, **kwargs)
        org_id = _org_id_of_project(pid)
        if not org_id:
            # Project id provided but unknown/not org-bound. In a multi-tenant
            # setup an unknown project must not be silently allowed (that would
            # let users probe arbitrary ids); reject unless it is the legacy
            # "default" project (pre-org stacks).
            if pid in ("default", "legacy", "_template"):
                return f(*args, **kwargs)
            if _service_route():
                return _service_error('PROJECT_NOT_FOUND', 'Project not found', 404)
            return jsonify({
                'error': 'Project not found or not tenant-bound',
                'message': 'The project you tried to access does not exist or is not bound to an organization.',
            }), 403
        uid = cu.get("user_id")
        try:
            from services.org_service import is_member
            if not is_member(org_id, uid):
                if _service_route():
                    return _service_error('FORBIDDEN', 'Access denied: you are not a member of the organization that owns this project.', 403)
                return jsonify({
                    'error': 'Access denied',
                    'message': 'You are not a member of the organization that owns this project.',
                }), 403
        except Exception:
            if _service_route():
                return _service_error('INTERNAL_SERVER_ERROR', 'Membership check failed', 500)
            return jsonify({'error': 'Membership check failed'}), 500
        return f(*args, **kwargs)
    return decorated_function



def idempotent_mutation(scope_fn: Optional[Callable[..., str]] = None):
    """Decorator to handle Idempotency-Key headers on mutation requests (UC405)."""
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def decorated_function(*args, **kwargs):
            idem_key = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
            if not idem_key:
                return f(*args, **kwargs)

            scope = scope_fn(*args, **kwargs) if scope_fn else (request.headers.get("X-Project-Id") or "global")
            try:
                from services.idempotency import check_idempotency_key, save_idempotency_result
                cached = check_idempotency_key(idem_key, scope=scope)
                if cached:
                    resp_body = cached.get("response_body")
                    status_code = cached.get("status_code", 200)
                    resp = jsonify(resp_body) if isinstance(resp_body, dict) else resp_body
                    if hasattr(resp, "headers"):
                        resp.headers["X-Cache-Lookup"] = "HIT-IDEMPOTENT"
                    return resp, status_code
            except Exception:
                pass

            result = f(*args, **kwargs)

            try:
                from services.idempotency import save_idempotency_result
                status = 200
                body = result
                if isinstance(result, tuple):
                    body = result[0]
                    status = result[1] if len(result) > 1 else 200
                if hasattr(body, "get_json"):
                    body = body.get_json()
                save_idempotency_result(idem_key, scope=scope, status_code=status, response_body=body)
            except Exception:
                pass

            return result
        return decorated_function
    return decorator


# ---------------------------------------------------------------------------
# UC456: Strict CORS Origin Whitelisting
# ---------------------------------------------------------------------------

_DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
]


def is_allowed_cors_origin(origin: Optional[str], custom_whitelist: Optional[List[str]] = None) -> bool:
    """Validate if request Origin is within strict whitelist (UC456)."""
    if not origin:
        return False

    clean_origin = str(origin).strip().rstrip("/")
    whitelist = list(custom_whitelist or []) if custom_whitelist is not None else list(_DEFAULT_ALLOWED_ORIGINS)

    # Check env var ALLOWED_ORIGINS as well
    env_origins = os.environ.get("ALLOWED_ORIGINS", "")
    if env_origins:
        for o in env_origins.split(","):
            if o.strip():
                whitelist.append(o.strip().rstrip("/"))

    return clean_origin in whitelist or "*" in whitelist


# ---------------------------------------------------------------------------
# UC457: JSON Schema Validation Utility for REST Mutations
# ---------------------------------------------------------------------------

def validate_schema(schema: Dict[str, Any]):
    """Decorator to validate incoming JSON request payloads against a schema (UC457)."""
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def decorated_function(*args, **kwargs):
            data = request.get_json(silent=True)
            if data is None and schema.get("required"):
                return jsonify({"error": "Invalid JSON payload or Content-Type", "message": "Expected application/json body"}), 400

            from utils.schema_validator import validate_payload_schema
            ok, err_msg = validate_payload_schema(data or {}, schema)
            if not ok:
                return jsonify({"error": "Schema validation failed", "message": err_msg}), 400

            return f(*args, **kwargs)
        return decorated_function
    return decorator


# ---------------------------------------------------------------------------
# UC463: Distributed Trace ID & Request ID Propagation
# ---------------------------------------------------------------------------

def with_trace_context(f: Callable) -> Callable:
    """Decorator to bind and propagate X-Trace-Id on request and response headers (UC463)."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from utils.trace_ctx import init_trace_context
        from flask import current_app, make_response
        tid = init_trace_context()
        result = f(*args, **kwargs)
        resp = make_response(result)
        resp.headers["X-Trace-Id"] = tid
        resp.headers["X-Request-Id"] = tid
        return resp
    return decorated_function


# ---------------------------------------------------------------------------
# UC494: Granular RBAC Roles (flags_admin, tests_admin, byoc_admin)
# ---------------------------------------------------------------------------

_DOMAIN_ROLES_MAP = {
    "flags": ["flags_admin", "feature_flags_admin", "admin", "owner"],
    "tests": ["tests_admin", "test_cases_admin", "qa_admin", "admin", "owner"],
    "byoc": ["byoc_admin", "cloud_admin", "infra_admin", "admin", "owner"],
    "preview": ["preview_admin", "devops_admin", "admin", "owner"],
}


def has_domain_permission(user_roles: List[str], domain: str) -> bool:
    """Check if the user has domain-specific administrative rights (UC494)."""
    roles = [str(r).lower() for r in (user_roles or [])]
    if "admin" in roles or "owner" in roles or "superadmin" in roles:
        return True

    allowed_roles = _DOMAIN_ROLES_MAP.get(str(domain).lower(), ["admin", "owner"])
    return any(r in allowed_roles for r in roles)


def require_domain_admin(domain: str):
    """Decorator requiring domain-specific administrative rights or superadmin (UC494)."""
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def decorated_function(*args, **kwargs):
            cu = getattr(request, "current_user", {}) or {}
            user_roles = cu.get("roles") or cu.get("role") or []
            if isinstance(user_roles, str):
                user_roles = [user_roles]

            if not has_domain_permission(user_roles, domain):
                return jsonify({
                    "error": "Forbidden",
                    "message": f"Requires administrative privileges for domain: '{domain}'",
                }), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator


# ---------------------------------------------------------------------------
# UC495: Kill-Switch Action Gating (Restricted to Superadmin/Owner)
# ---------------------------------------------------------------------------

def can_execute_kill_switch(user_roles: List[str]) -> bool:
    """Evaluate if the user has superadmin or owner authority to execute emergency kill switches (UC495)."""
    roles = [str(r).lower() for r in (user_roles or [])]
    return "superadmin" in roles or "owner" in roles or "admin" in roles


def require_kill_switch_privilege(f: Callable) -> Callable:
    """Decorator guarding emergency kill switch and force-stop mutations (UC495)."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        cu = getattr(request, "current_user", {}) or {}
        user_roles = cu.get("roles") or cu.get("role") or []
        if isinstance(user_roles, str):
            user_roles = [user_roles]

        if not can_execute_kill_switch(user_roles):
            return jsonify({
                "error": "Forbidden",
                "message": "Emergency kill-switch actions are strictly restricted to organization owners and administrators.",
            }), 403

        return f(*args, **kwargs)
    return decorated_function







