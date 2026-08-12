"""BYOC management routes (Fase 6 — UC 271+)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.byoc import (
    create_account, delete_account, generate_import, get_account, get_inventory,
    list_accounts, providers, validate_account,
)

bp = Blueprint("byoc_api", __name__)


@bp.route('/api/byoc/providers', methods=['GET'])
@require_auth
def api_byoc_providers():
    return jsonify({"providers": providers()})


@bp.route('/api/byoc/accounts', methods=['GET'])
@require_auth
def api_byoc_list():
    return jsonify({"accounts": list_accounts()})


@bp.route('/api/byoc/accounts', methods=['POST'])
@require_auth
def api_byoc_create():
    data = request.get_json(silent=True) or {}
    try:
        acct = create_account(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "account": acct}), 201


@bp.route('/api/byoc/accounts/<account_id>', methods=['DELETE'])
@require_auth
def api_byoc_delete(account_id):
    if not delete_account(account_id):
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True})


@bp.route('/api/byoc/accounts/<account_id>/validate', methods=['POST'])
@require_auth
def api_byoc_validate(account_id):
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
    try:
        out = get_inventory(account_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify(out)


@bp.route('/api/byoc/accounts/<account_id>/import', methods=['POST'])
@require_auth
def api_byoc_import(account_id):
    data = request.get_json(silent=True) or {}
    resource_ids = data.get("resource_ids") or []
    if not resource_ids:
        return jsonify({"error": "resource_ids required"}), 400
    try:
        out = generate_import(account_id, resource_ids)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify(out)