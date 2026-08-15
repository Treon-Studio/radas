"""Feature-flag routes with tenant-scoped authorization."""
from __future__ import annotations

import json
from flask import Blueprint, jsonify, request, Response

try:
    from auth.middleware import require_auth, _org_id_of_project
except ImportError:
    from ..auth.middleware import require_auth, _org_id_of_project

from services.feature_flag_registry import (
    archive_flag, audit, create_flag, delete_flag, evaluate, impact, import_flags,
    list_flags, restore_flag, update_flag,
)

bp = Blueprint("feature_flag_api", __name__)


class ScopeError(ValueError):
    pass


def _values(data, field, header=None):
    values = [data.get(field), request.args.get(field)]
    if header:
        values.append(request.headers.get(header))
    return {str(value).strip() for value in values if value is not None and str(value).strip()}


def _scope_context(data=None):
    """Resolve a scope and reject conflicting client supplied identifiers."""
    data = data or {}
    project_ids = _values(data, "project_id", "X-Project-Id")
    org_ids = _values(data, "org_id", "X-Org-Id")
    if len(project_ids) > 1 or len(org_ids) > 1:
        raise ScopeError("Conflicting scope identifiers")
    if project_ids:
        project_id = next(iter(project_ids))
        org_id = _org_id_of_project(project_id)
        if not org_id:
            raise ScopeError("Project not found or not tenant-bound")
        if org_ids and next(iter(org_ids)) != org_id:
            raise ScopeError("Project and organization identifiers do not match")
        return "project", project_id, org_id
    if org_ids:
        org_id = next(iter(org_ids))
        return "organization", org_id, org_id
    return "global", None, None


def _actor():
    user = getattr(request, "current_user", {}) or {}
    return (user.get("user_id", ""), user.get("username", ""))


def _scope_admin(scope_type, org_id):
    user = getattr(request, "current_user", {}) or {}
    if user.get("user_id") == "__internal__" or "admin" in (user.get("roles") or []):
        return True
    if scope_type == "global" or not user.get("user_id"):
        return False
    from services.org_service import member_role
    return member_role(org_id, user["user_id"]) in ("owner", "admin")


def _authorize_scope(data=None, mutation=False):
    """Return scope context or a JSON 4xx response for an unauthorized scope."""
    try:
        scope_type, scope_id, org_id = _scope_context(data)
    except ScopeError as exc:
        return None, (jsonify({"error": str(exc)}), 400)
    user = getattr(request, "current_user", {}) or {}
    user_id = user.get("user_id")
    if not user_id:
        return None, (jsonify({"error": "Authentication required"}), 401)
    if user_id == "__internal__":
        return (scope_type, scope_id, org_id), None
    if scope_type == "global":
        if mutation and not _scope_admin(scope_type, org_id):
            return None, (jsonify({"error": "admin required"}), 403)
        return (scope_type, scope_id, org_id), None
    from services.org_service import is_member
    if not is_member(org_id, user_id):
        return None, (jsonify({"error": "Access denied"}), 403)
    if scope_type == "organization" and mutation and not _scope_admin(scope_type, org_id):
        return None, (jsonify({"error": "owner/admin required"}), 403)
    return (scope_type, scope_id, org_id), None


def _scoped(data=None, mutation=False):
    context, error = _authorize_scope(data, mutation)
    return context, error


@bp.route('/api/flags', methods=['GET'])
@require_auth
def api_list_flags():
    context, error = _scoped()
    if error:
        return error
    scope_type, scope_id, org_id = context
    return jsonify({"flags": list_flags(scope_type, scope_id, effective=scope_type != "global", org_id=org_id)})


@bp.route('/api/flags/audit', methods=['GET'])
@require_auth
def api_flag_audit():
    context, error = _scoped()
    if error:
        return error
    scope_type, scope_id, _ = context
    try:
        limit = max(1, min(500, int(request.args.get("limit", "100"))))
    except (TypeError, ValueError):
        limit = 100
    try:
        offset = max(0, int(request.args.get("offset", "0")))
    except (TypeError, ValueError):
        offset = 0
    return jsonify({"audit": audit(scope_type, scope_id, request.args.get("flag_key") or None, limit, offset)})


@bp.route('/api/flags', methods=['POST'])
@require_auth
def api_create_flag():
    data = request.get_json(silent=True) or {}
    context, error = _scoped(data, mutation=True)
    if error:
        return error
    scope_type, scope_id, org_id = context
    actor_id, actor_name = _actor()
    try:
        flag = create_flag(data, scope_type, scope_id, actor=actor_id, actor_name=actor_name, org_id=org_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    return jsonify({"success": True, "flag": flag}), 201


@bp.route('/api/flags/<key>', methods=['PATCH'])
@require_auth
def api_update_flag(key):
    data = request.get_json(silent=True) or {}
    context, error = _scoped(data, mutation=True)
    if error:
        return error
    scope_type, scope_id, org_id = context
    actor_id, actor_name = _actor()
    try:
        flag = update_flag(key, data, scope_type, scope_id, actor=actor_id, actor_name=actor_name, org_id=org_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not flag:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "flag": flag})


@bp.route('/api/flags/<key>', methods=['DELETE'])
@require_auth
def api_delete_flag(key):
    context, error = _scoped(mutation=True)
    if error:
        return error
    scope_type, scope_id, org_id = context
    actor_id, actor_name = _actor()
    try:
        deleted = delete_flag(key, scope_type, scope_id, actor=actor_id, actor_name=actor_name, org_id=org_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if not deleted:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True})


@bp.route('/api/flags/<key>/impact', methods=['GET'])
@require_auth
def api_flag_impact(key):
    context, error = _scoped()
    if error:
        return error
    scope_type, scope_id, org_id = context
    try:
        return jsonify(impact(key, scope_type, scope_id, org_id))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404


@bp.route('/api/flags/<key>/archive', methods=['POST'])
@require_auth
def api_archive_flag(key):
    data = request.get_json(silent=True) or {}
    context, error = _scoped(data, mutation=True)
    if error:
        return error
    scope_type, scope_id, org_id = context
    actor_id, actor_name = _actor()
    try:
        flag = archive_flag(key, scope_type, scope_id, actor_id, actor_name, data.get("reason") or "", org_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    if not flag:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "flag": flag})


@bp.route('/api/flags/<key>/restore', methods=['POST'])
@require_auth
def api_restore_flag(key):
    data = request.get_json(silent=True) or {}
    context, error = _scoped(data, mutation=True)
    if error:
        return error
    scope_type, scope_id, org_id = context
    actor_id, actor_name = _actor()
    flag = restore_flag(key, scope_type, scope_id, actor_id, actor_name, org_id)
    if not flag:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "flag": flag})


@bp.route('/api/flags/evaluate', methods=['POST'])
@require_auth
def api_evaluate_flag():
    data = request.get_json(silent=True) or {}
    key = (data.get("key") or "").strip()
    if not key:
        return jsonify({"error": "key required"}), 400
    context, error = _scoped(data)
    if error:
        return error
    scope_type, scope_id, org_id = context
    actor_id, _ = _actor()
    requested_user = data.get("user") or actor_id
    if data.get("user") and requested_user != actor_id and not _scope_admin(scope_type, org_id):
        return jsonify({"error": "admin required to preview another user"}), 403
    return jsonify(evaluate(key, env=data.get("env") or "prod", user=requested_user,
                            project_id=scope_id if scope_type == "project" else None, org_id=org_id))


@bp.route('/api/flags/export', methods=['GET'])
@require_auth
def api_export_flags():
    context, error = _scoped()
    if error:
        return error
    scope_type, scope_id, org_id = context
    return Response(json.dumps({"flags": list_flags(scope_type, scope_id, org_id=org_id), "scope_type": scope_type, "scope_id": scope_id}, indent=2), mimetype="application/json", headers={"Content-Disposition": "attachment; filename=radas-flags.json"})


@bp.route('/api/flags/import', methods=['POST'])
@require_auth
def api_import_flags():
    data = request.get_json(silent=True) or {}
    context, error = _scoped(data, mutation=True)
    if error:
        return error
    scope_type, scope_id, org_id = context
    actor_id, actor_name = _actor()
    try:
        result = import_flags(data.get("flags"), scope_type, scope_id, actor_id, actor_name, org_id)
    except ValueError as exc:
        return jsonify({"error": "invalid import", "errors": [{"message": str(exc)}]}), 400
    return jsonify({"success": True, "imported": len(result["flags"]), **result}), 201


@bp.route('/api/flags/evaluations', methods=['GET'])
@require_auth
def api_flag_evaluations():
    context, error = _scoped()
    if error:
        return error
    scope_type, scope_id, _ = context
    try:
        limit = max(1, min(500, int(request.args.get("limit", "100"))))
    except (TypeError, ValueError):
        limit = 100
    return jsonify({"evaluations": audit(scope_type, scope_id, request.args.get("flag_key"), limit)})


@bp.route('/api/flags/<key>/rollback', methods=['POST'])
@require_auth
def api_flag_rollback(key):
    data = request.get_json(silent=True) or {}
    context, error = _scoped(data, mutation=True)
    if error:
        return error
    scope_type, scope_id, org_id = context
    rows = audit(scope_type, scope_id, key, 50)
    previous = next((row.get("before") for row in rows if row.get("before")), None)
    if not previous:
        return jsonify({"error": "no previous version"}), 404
    actor_id, actor_name = _actor()
    try:
        restored = update_flag(key, previous, scope_type, scope_id, actor=actor_id, actor_name=actor_name, operation="rollback", org_id=org_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not restored:
        return jsonify({"error": "not found or conflicted"}), 409
    return jsonify({"success": True, "flag": restored})
