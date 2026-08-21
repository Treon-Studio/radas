"""BYOC management routes (Fase 6 — UC 271+)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services import org_service
from storage import pg
from services.byoc import (
    create_account, delete_account, generate_import, get_account, get_inventory,
    list_accounts, providers, validate_account, list_managed_resources, set_resource_management, list_inventory_snapshots, inventory_drift, sync_state_resources, estimate_account_cost, set_account_budget, check_account_budget, get_inventory_page,
)

bp = Blueprint("byoc_api", __name__)


def _account_access(account_id: str, *, write: bool = False):
    """Resolve project-scoped account access; legacy records fail closed."""
    project_id = request.headers.get("X-Project-Id") or request.args.get("project_id")
    if not project_id:
        return None, (jsonify({"error": "project_id is required"}), 400)
    project = pg.query_one("SELECT org_id FROM projects WHERE id=%s", (project_id,))
    user_id = (getattr(request, "current_user", {}) or {}).get("user_id")
    if not project or not project.get("org_id"):
        return None, (jsonify({"error": "project access denied"}), 403)
    role = org_service.member_role(project["org_id"], user_id)
    if user_id != "__internal__" and role is None:
        return None, (jsonify({"error": "project access denied"}), 403)
    account = get_account(account_id)
    if not account or not account.get("org_id") or not account.get("project_id"):
        return None, (jsonify({"error": "account requires ownership migration"}), 409)
    if account["org_id"] != project["org_id"] or account["project_id"] != project_id:
        return None, (jsonify({"error": "account access denied"}), 403)
    if write and user_id != "__internal__" and role not in {"owner", "admin"}:
        return None, (jsonify({"error": "account mutation denied"}), 403)
    return account, None


@bp.route('/api/byoc/providers/detect', methods=['POST'])
@require_auth
def api_byoc_detect_provider():
    from services.byoc import detect_provider
    return jsonify(detect_provider(request.get_json(silent=True) or {}))


@bp.route('/api/byoc/providers', methods=['GET'])
@require_auth
def api_byoc_providers():
    return jsonify({"providers": providers()})


@bp.route('/api/byoc/accounts', methods=['GET'])
@require_auth
def api_byoc_list():
    project_id = request.headers.get("X-Project-Id") or request.args.get("project_id")
    if not project_id:
        return jsonify({"error": "project_id is required"}), 400
    project = pg.query_one("SELECT org_id FROM projects WHERE id=%s", (project_id,))
    user_id = (getattr(request, "current_user", {}) or {}).get("user_id")
    if not project or not project.get("org_id") or not org_service.is_member(project["org_id"], user_id):
        return jsonify({"error": "project access denied"}), 403
    accounts = [account for account in list_accounts() if account.get("org_id") == project["org_id"] and account.get("project_id") == project_id]
    return jsonify({"accounts": accounts})


@bp.route('/api/byoc/accounts', methods=['POST'])
@require_auth
def api_byoc_create():
    data = request.get_json(silent=True) or {}
    project_id = request.headers.get("X-Project-Id") or data.get("project_id")
    if not project_id:
        return jsonify({"error": "project_id is required"}), 400
    project = pg.query_one("SELECT org_id FROM projects WHERE id=%s", (project_id,))
    user_id = (getattr(request, "current_user", {}) or {}).get("user_id")
    if not project or not project.get("org_id") or not org_service.is_member(project["org_id"], user_id):
        return jsonify({"error": "project access denied"}), 403
    data["project_id"] = project_id
    data["org_id"] = project["org_id"]
    try:
        acct = create_account(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "account": acct}), 201


@bp.route('/api/byoc/accounts/<account_id>', methods=['DELETE'])
@require_auth
def api_byoc_delete(account_id):
    _, error = _account_access(account_id, write=True)
    if error:
        return error
    if not delete_account(account_id):
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True})


@bp.route('/api/byoc/accounts/<account_id>/validate', methods=['POST'])
@require_auth
def api_byoc_validate(account_id):
    _, error = _account_access(account_id, write=True)
    if error:
        return error
    try:
        out = validate_account(account_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify(out)


@bp.route('/api/byoc/check-due', methods=['POST'])
@require_auth
def api_byoc_check_due():
    from services.byoc import check_due_accounts
    return jsonify({"checked": check_due_accounts()})


@bp.route('/api/byoc/accounts/<account_id>/rotate', methods=['POST'])
@require_auth
def api_byoc_rotate(account_id):
    _, error = _account_access(account_id, write=True)
    if error:
        return error
    from services.byoc import rotate_credentials
    data = request.get_json(silent=True) or {}
    try:
        out = rotate_credentials(account_id, data.get("credentials") or {})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify(out)


@bp.route('/api/byoc/accounts/<account_id>/inventory', methods=['GET'])
@require_auth
def api_byoc_inventory(account_id):
    _, error = _account_access(account_id)
    if error:
        return error
    try:
        limit = max(1, min(500, int(request.args.get("limit", 100))))
        offset = max(0, int(request.args.get("offset", 0)))
        out = get_inventory_page(account_id, limit, offset)
    except (TypeError, ValueError) as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(out)


@bp.route('/api/byoc/accounts/<account_id>/inventory/drift', methods=['GET'])
@require_auth
def api_byoc_inventory_drift(account_id):
    _, error = _account_access(account_id)
    if error:
        return error
    try:
        return jsonify(inventory_drift(account_id))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404


@bp.route('/api/byoc/accounts/<account_id>/inventory/snapshots', methods=['GET'])
@require_auth
def api_byoc_inventory_snapshots(account_id):
    _, error = _account_access(account_id)
    if error:
        return error
    try:
        limit = max(1, min(20, int(request.args.get("limit", 20))))
        return jsonify({"snapshots": list_inventory_snapshots(account_id, limit)})
    except (ValueError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/byoc/accounts/<account_id>/managed-resources', methods=['GET'])
@require_auth
def api_byoc_managed_resources(account_id):
    _, error = _account_access(account_id)
    if error:
        return error
    try:
        return jsonify({"resources": list_managed_resources(account_id)})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404


@bp.route('/api/byoc/accounts/<account_id>/managed-resources', methods=['PUT'])
@require_auth
def api_byoc_set_managed_resources(account_id):
    _, error = _account_access(account_id, write=True)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(set_resource_management(account_id, data.get("resource_ids") or [], bool(data.get("managed", True))))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/byoc/accounts/<account_id>/budget', methods=['PUT'])
@require_auth
def api_byoc_set_budget(account_id):
    _, error = _account_access(account_id, write=True)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(set_account_budget(account_id, data.get("amount"), data.get("currency", "USD"), data.get("alert_at_pct", 80)))
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/byoc/accounts/<account_id>/budget/check', methods=['GET'])
@require_auth
def api_byoc_check_budget(account_id):
    _, error = _account_access(account_id)
    if error:
        return error
    try:
        return jsonify(check_account_budget(account_id))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404


@bp.route('/api/byoc/accounts/<account_id>/cost', methods=['GET'])
@require_auth
def api_byoc_cost(account_id):
    _, error = _account_access(account_id)
    if error:
        return error
    try:
        return jsonify(estimate_account_cost(account_id))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404


@bp.route('/api/byoc/accounts/<account_id>/state-sync', methods=['POST'])
@require_auth
def api_byoc_state_sync(account_id):
    _, error = _account_access(account_id, write=True)
    if error:
        return error
    try:
        return jsonify(sync_state_resources(account_id, request.get_json(silent=True) or {}))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/byoc/accounts/<account_id>/import', methods=['POST'])
@require_auth
def api_byoc_import(account_id):
    from services.byoc_import_mapping import prepare_import_mapping

    data = request.get_json(silent=True) or {}
    project_scope = data.get("project_id") or request.headers.get("X-Project-Id")
    if project_scope and data.get("project_id"):
        _, access_error = _account_access(account_id, write=True)
        if access_error and access_error[1] != 404:
            return access_error
    if data.get("project_id") != request.headers.get("X-Project-Id") and request.headers.get("X-Project-Id") and data.get("project_id"):
        return jsonify({"error": "project access denied"}), 403
    try:
        result = prepare_import_mapping(
            account_id,
            project_id=data.get("project_id"),
            stack=data.get("stack"),
            resource_ids=data.get("resource_ids") or [],
            address_overrides=data.get("address_overrides") or {},
            actor_id=(getattr(request, "current_user", {}) or {}).get("user_id"),
        )
    except ValueError as exc:
        message = str(exc)
        status = 403 if "access" in message or "tenant" in message else 404 if "not found" in message or "latest inventory" in message else 400
        return jsonify({"error": message}), status
    return jsonify(result)
