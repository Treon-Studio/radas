"""Test case routes (Fase 6 — UC 161+)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth, require_project_access

from services.test_cases import (
    ASSERTIONS, clone_test_case, create_test_case, delete_test_case, get_test_case, list_test_cases,
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
    enabled = request.args.get("enabled")
    enabled_filter = None if enabled is None else enabled.strip().lower() in {"1", "true", "yes"}
    try:
        limit = max(1, min(500, int(request.args.get("limit", 100))))
        offset = max(0, int(request.args.get("offset", 0)))
    except (TypeError, ValueError):
        return jsonify({"error": "limit and offset must be integers"}), 400
    rows = list_test_cases(_pid(), tag=request.args.get("tag", ""), environment=request.args.get("environment", ""), enabled=enabled_filter, kind=request.args.get("kind", ""))
    page = rows[offset:offset + limit]
    next_offset = offset + limit if offset + limit < len(rows) else None
    return jsonify({"test_cases": page, "limit": limit, "offset": offset, "next_offset": next_offset, "has_more": next_offset is not None})


@bp.route('/api/tests/validate', methods=['POST'])
@require_project_access
def api_validate_test_definition():
    from services.test_cases import validate_test_definition
    return jsonify(validate_test_definition(request.get_json(silent=True) or {}))


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
    try:
        tc = update_test_case(test_id, request.get_json(silent=True) or {}, _pid())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not tc:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "test_case": tc})


@bp.route('/api/tests/<test_id>/versions', methods=['GET'])
@require_project_access
def api_test_versions(test_id):
    from services.test_cases import list_test_case_versions
    return jsonify({"versions": list_test_case_versions(test_id, _pid())})


@bp.route('/api/tests/<test_id>/versions/<int:version>/rollback', methods=['POST'])
@require_project_access
def api_test_rollback_version(test_id, version):
    from services.test_cases import rollback_test_case
    try:
        restored = rollback_test_case(test_id, version, _pid())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not restored:
        return jsonify({"error": "version not found"}), 404
    return jsonify({"success": True, "test_case": restored})


@bp.route('/api/tests/<test_id>', methods=['DELETE'])
@require_project_access
def api_delete_test(test_id):
    if not delete_test_case(test_id, _pid()):
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True})


@bp.route('/api/tests/<test_id>/clone', methods=['POST'])
@require_project_access
def api_clone_test(test_id):
    clone = clone_test_case(test_id, _pid())
    if not clone:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "test_case": clone}), 201


@bp.route('/api/tests/<test_id>/run', methods=['POST'])
@require_project_access
def api_run_test(test_id):
    body = request.get_json(silent=True) or {}
    try:
        timeout = max(1, min(300, int(body.get("timeout_seconds", 30))))
    except (TypeError, ValueError):
        timeout = 30
    try:
        result = run_test_case(
            _pid(), test_id, timeout_seconds=timeout, mock_provider=bool(body.get("mock_provider", False)),
            max_retries=body.get("max_retries", 0), backoff_base_seconds=body.get("backoff_base_seconds", 0.5),
        )
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
    from services.test_cases import run_batch_tests
    data = request.get_json(silent=True) or {}
    try:
        concurrency = max(1, min(8, int(data.get("concurrency", 1))))
        retries = max(0, min(5, int(data.get("max_retries", 0))))
        backoff = max(0.0, min(5.0, float(data.get("backoff_base_seconds", 0.5))))
    except (TypeError, ValueError):
        return jsonify({"error": "concurrency, max_retries, and backoff_base_seconds must be numeric"}), 400
    result = run_batch_tests(_pid(), (data.get("stack") or "").strip(), concurrency, retries, backoff)
    return jsonify({"success": True, **result}), 201


@bp.route('/api/tests/<test_id>/baseline', methods=['POST'])
@require_project_access
def api_create_test_baseline(test_id):
    from services.test_cases import create_test_baseline
    try:
        return jsonify({"baseline": create_test_baseline(_pid(), test_id, (request.get_json(silent=True) or {}).get("run_id"))}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/tests/<test_id>/baseline', methods=['GET'])
@require_project_access
def api_get_test_baseline(test_id):
    from services.test_cases import get_test_baseline
    return jsonify({"baseline": get_test_baseline(_pid(), test_id)})


@bp.route('/api/tests/<test_id>/baseline/compare', methods=['GET'])
@require_project_access
def api_compare_test_baseline(test_id):
    from services.test_cases import compare_test_baseline
    try:
        return jsonify(compare_test_baseline(_pid(), test_id))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/tests/results/export', methods=['GET'])
@require_project_access
def api_test_results_export():
    results = list_test_results(500, _pid(), request.args.get("test_id"))
    return jsonify({"schema_version": "test-results.v1", "format": "json", "project_id": _pid(),
                    "generated_at": int(__import__("time").time()), "count": len(results), "results": results})


@bp.route('/api/tests/scheduled-run', methods=['POST'])
@require_project_access
def api_scheduled_run_tests():
    from services.test_cases import run_scheduled_tests
    try:
        timeout = max(1, min(300, int((request.get_json(silent=True) or {}).get("timeout_seconds", 30))))
    except (TypeError, ValueError): timeout = 30
    return jsonify({"success": True, **run_scheduled_tests(_pid(), timeout_seconds=timeout)}), 201


@bp.route('/api/tests/results', methods=['GET'])
@require_project_access
def api_test_results():
    try:
        limit = max(1, min(500, int(request.args.get("limit") or 100)))
        offset = max(0, int(request.args.get("offset") or 0))
    except (TypeError, ValueError):
        return jsonify({"error": "limit and offset must be integers"}), 400
    all_results = list_test_results(500, _pid(), request.args.get("test_id"))[::-1]
    page = all_results[offset:offset + limit]
    next_offset = offset + limit if offset + limit < len(all_results) else None
    return jsonify({"results": page, "limit": limit, "offset": offset, "next_offset": next_offset, "has_more": next_offset is not None})
