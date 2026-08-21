"""Drift detection schedule management routes (UC342)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_project_access
except ImportError:
    from ..auth.middleware import require_project_access

from services.cloud_provisioning import get_drift_schedule, set_drift_schedule, _stack_dir
from services.drift_scheduler import run_drift_check_for_stack
from utils.request_ctx import get_project_id_from_request

bp = Blueprint("drift_api", __name__, url_prefix="/api/cloud/stacks")


@bp.route("/<stack>/drift-schedule", methods=["GET"])
@require_project_access
def api_get_drift_schedule(stack):
    """Get drift schedule configuration for a stack."""
    pid = get_project_id_from_request(lambda: None)
    if not pid:
        return jsonify({"error": "Project required", "message": "X-Project-Id header required"}), 400
    if not _stack_dir(pid, stack).exists():
        return jsonify({"error": "Stack not found"}), 404
    schedule = get_drift_schedule(pid, stack)
    return jsonify(schedule)


@bp.route("/<stack>/drift-schedule", methods=["PUT"])
@require_project_access
def api_set_drift_schedule(stack):
    """Set drift schedule configuration for a stack."""
    pid = get_project_id_from_request(lambda: None)
    if not pid:
        return jsonify({"error": "Project required", "message": "X-Project-Id header required"}), 400
    if not _stack_dir(pid, stack).exists():
        return jsonify({"error": "Stack not found"}), 404

    data = request.get_json(silent=True) or {}
    try:
        set_drift_schedule(pid, stack, data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify({"success": True, "stack": stack, "schedule": get_drift_schedule(pid, stack)})


@bp.route("/<stack>/drift-check", methods=["POST"])
@require_project_access
def api_run_drift_check(stack):
    """Manually trigger a drift check for a stack."""
    pid = get_project_id_from_request(lambda: None)
    if not pid:
        return jsonify({"error": "Project required", "message": "X-Project-Id header required"}), 400
    if not _stack_dir(pid, stack).exists():
        return jsonify({"error": "Stack not found"}), 404

    try:
        result = run_drift_check_for_stack(pid, stack)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify(result)