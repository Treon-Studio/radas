"""Test case routes (Fase 6 — UC 161+)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.test_cases import (
    ASSERTIONS, create_test_case, delete_test_case, get_test_case, list_test_cases,
    list_test_results, run_test_case, update_test_case,
)
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("test_case_api", __name__)


def _pid():
    return request.args.get("project_id") or _get_pid_raw(lambda: None)


@bp.route('/api/tests/catalog', methods=['GET'])
@require_auth
def api_test_catalog():
    return jsonify({"assertions": [
        {"id": k, "name": v["name"], "desc": v["desc"], "severity": v["severity"]}
        for k, v in sorted(ASSERTIONS.items())
    ]})


@bp.route('/api/tests', methods=['GET'])
@require_auth
def api_list_tests():
    return jsonify({"test_cases": list_test_cases()})


@bp.route('/api/tests', methods=['POST'])
@require_auth
def api_create_test():
    data = request.get_json(silent=True) or {}
    try:
        tc = create_test_case(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "test_case": tc}), 201


@bp.route('/api/tests/<test_id>', methods=['PATCH'])
@require_auth
def api_update_test(test_id):
    tc = update_test_case(test_id, request.get_json(silent=True) or {})
    if not tc:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "test_case": tc})


@bp.route('/api/tests/<test_id>', methods=['DELETE'])
@require_auth
def api_delete_test(test_id):
    if not delete_test_case(test_id):
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True})


@bp.route('/api/tests/<test_id>/run', methods=['POST'])
@require_auth
def api_run_test(test_id):
    try:
        result = run_test_case(_pid(), test_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "result": result}), 201


@bp.route('/api/tests/results', methods=['GET'])
@require_auth
def api_test_results():
    try:
        limit = max(1, min(500, int(request.args.get("limit") or 100)))
    except (TypeError, ValueError):
        limit = 100
    return jsonify({"results": list_test_results(limit)})