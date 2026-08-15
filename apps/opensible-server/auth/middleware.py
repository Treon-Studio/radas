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
"""
from functools import wraps
from flask import request, jsonify
from typing import Any, Optional, Callable
from pathlib import Path
import logging
import os
import hmac

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
_env_internal = os.environ.get('INTERNAL_CALL_SECRET') or ''
_flask_env = (os.environ.get('FLASK_ENV') or '').lower()
_is_production = _flask_env == 'production'

if not _env_internal:
    raise RuntimeError(
        "INTERNAL_CALL_SECRET must be configured; refusing to generate a per-process secret"
    )
_KNOWN_REPOSITORY_SECRET = "dev-only-change-me-0123456789abcdef"


def _require_strong_production_secret(name: str, value: str) -> str:
    secret = (value or "").strip()
    if not _is_production:
        return secret
    if not secret:
        raise RuntimeError(f"{name} must be explicitly configured in production")
    if secret == _KNOWN_REPOSITORY_SECRET:
        raise RuntimeError(f"{name} must not use a repository-known secret in production")
    if len(secret) < 32 or len(set(secret)) < 16:
        raise RuntimeError(f"{name} must be a strong secret in production")
    if not any(char.isalpha() for char in secret) or not any(char.isdigit() for char in secret):
        raise RuntimeError(f"{name} must contain letters and digits in production")
    return secret


if _is_production:
    _require_strong_production_secret("INTERNAL_CALL_SECRET", _env_internal)
    _require_strong_production_secret(
        "WORKER_REGISTRATION_SECRET", os.environ.get("WORKER_REGISTRATION_SECRET", "")
    )
elif len(_env_internal) < 32:
    logger.warning("INTERNAL_CALL_SECRET is shorter than 32 chars — insecure.")

_INTERNAL_CALL_SECRET: str = _env_internal


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
            return jsonify({
                'error': 'Authentication required',
                'message': 'Access token missing',
            }), 401

        try:
            from services.worker_registry import verify_token as verify_worker_token
        except ImportError:
            from services.worker_registry import verify_token as verify_worker_token
        is_worker_path = request.path.startswith('/api/worker/')
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
                return jsonify({'error': 'Read-only access',
                                'message': 'This account has read-only access.'}), 403
            return f(*args, **kwargs)

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
            return jsonify({
                'error': 'Project not found or not tenant-bound',
                'message': 'The project you tried to access does not exist or is not bound to an organization.',
            }), 403
        uid = cu.get("user_id")
        try:
            from services.org_service import is_member
            if not is_member(org_id, uid):
                return jsonify({
                    'error': 'Access denied',
                    'message': 'You are not a member of the organization that owns this project.',
                }), 403
        except Exception:
            return jsonify({'error': 'Membership check failed'}), 500
        return f(*args, **kwargs)
    return decorated_function
