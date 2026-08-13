"""Test case routes (Fase 6 — UC 161+)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth, require_project_access

from services.test_cases import (
    ASSERTIONS, create_test_case, delete_test_case, get_test_case, list_test_cases,
    list_test_results, run_test_case, update_test_case,
)
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("test_case_api", __name__)


def _pid():
    return request.args.get("project_id") or _get_pid_raw(lambda: None)


@bp.route('/api/tests/catalog', methods=['GET'])
@require_project_access
def api_test_catalog():
    return jsonify({"assertions": [
        {"id": k, "name": v["name"], "desc": v["desc"], "severity": v["severity"]}
        for k, v in sorted(ASSERTIONS.items())
    ]})


@bp.route('/api/tests', methods=['GET'])
@require_project_access
def api_list_tests():
    return jsonify({"test_cases": list_test_cases(_pid())})


@bp.route('/api/tests', methods=['POST'])
@require_project_access
def api_create_test():
    data = request.get_json(silent=True) or {}
    try:
        tc = create_test_case(data, _pid())
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "test_case": tc}), 201


@bp.route('/api/tests/<test_id>', methods=['PATCH'])
@require_project_access
def api_update_test(test_id):
    tc = update_test_case(test_id, request.get_json(silent=True) or {}, _pid())
    if not tc:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "test_case": tc})


@bp.route('/api/tests/<test_id>', methods=['DELETE'])
@require_project_access
def api_delete_test(test_id):
    if not delete_test_case(test_id, _pid()):
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True})


@bp.route('/api/tests/<test_id>/run', methods=['POST'])
@require_project_access
def api_run_test(test_id):
    try:
        result = run_test_case(_pid(), test_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "result": result}), 201


@bp.route('/api/tests/<test_id>/tofu-test', methods=['POST'])
@require_project_access
def api_run_tofu_test(test_id):
    from services.test_cases import run_tofu_test
    try:
        result = run_tofu_test(_pid(), test_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "result": result}), 201


@bp.route('/api/tests/<test_id>/history', methods=['GET'])
@require_project_access
def api_test_history(test_id):
    try:
        limit = max(1, min(500, int(request.args.get("limit") or 100)))
    except (TypeError, ValueError):
        limit = 100
    return jsonify({"results": list_test_results(limit, _pid(), test_id)})


@bp.route('/api/tests/batch-run', methods=['POST'])
@require_project_access
def api_batch_run_tests():
    from services.test_cases import run_test_case
    project_id = _pid()
    data = request.get_json(silent=True) or {}
    stack = (data.get("stack") or "").strip()
    cases = [tc for tc in list_test_cases(project_id) if tc.get("enabled", True) and (not stack or tc.get("stack") == stack)]
    results = []
    errors = []
    for tc in cases:
        try:
            results.append(run_test_case(project_id, tc["id"]))
        except ValueError as exc:
            errors.append({"test_id": tc["id"], "error": str(exc)})
    return jsonify({"success": True, "results": results, "errors": errors, "count": len(results)}), 201


@bp.route('/api/tests/results', methods=['GET'])
@require_project_access
def api_test_results():
    try:
        limit = max(1, min(500, int(request.args.get("limit") or 100)))
    except (TypeError, ValueError):
        limit = 100
    return jsonify({"results": list_test_results(limit, _pid(), request.args.get("test_id"))})