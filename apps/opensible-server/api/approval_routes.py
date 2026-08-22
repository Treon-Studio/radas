"""Approval workflow routes (Fase 2 — UC 50/68/72)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from services.approval_service import (
    create_approval, decide, has_approved, latest_pending, list_approvals,
)
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("approval_api", __name__)

ACTIONS = ("apply", "destroy", "plan")


def _who():
    cu = getattr(request, "current_user", {}) or {}
    return cu.get("username") or cu.get("email") or cu.get("user_id") or ""


@bp.route('/api/approvals', methods=['GET'])
@require_project_access
def api_list_approvals():
    pid = request.args.get("project_id") or _get_pid_raw(lambda: None)
    status = request.args.get("status")
    return jsonify({"approvals": list_approvals(project_id=pid, status=status)})


@bp.route('/api/approvals', methods=['POST'])
@require_project_access
def api_create_approval():
    data = request.get_json(silent=True) or {}
    stack = (data.get("stack") or "").strip()
    action = (data.get("action") or "").strip().lower()
    pid = data.get("project_id") or _get_pid_raw(lambda: None)
    if not stack or not pid:
        return jsonify({"error": "stack and project_id required"}), 400
    if action not in ACTIONS:
        return jsonify({"error": f"action must be one of {ACTIONS}"}), 400
    if latest_pending(stack, pid, action):
        return jsonify({"error": "A pending approval already exists for this action"}), 409
    rec = create_approval(stack, pid, action, requested_by=_who(), note=(data.get("note") or ""))
    return jsonify({"success": True, "approval": rec}), 201


@bp.route('/api/approvals/<approval_id>/approve', methods=['POST'])
@require_project_access
def api_approve(approval_id):
    rec = decide(approval_id, "approved", decided_by=_who())
    if not rec:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "approval": rec})


@bp.route('/api/approvals/<approval_id>/reject', methods=['POST'])
@require_project_access
def api_reject(approval_id):
    rec = decide(approval_id, "rejected", decided_by=_who())
    if not rec:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "approval": rec})


@bp.route('/api/approvals/check', methods=['GET'])
@require_project_access
def api_check_approval():
    pid = request.args.get("project_id") or _get_pid_raw(lambda: None)
    stack = request.args.get("stack") or ""
    action = request.args.get("action") or "apply"
    if not stack or not pid:
        return jsonify({"error": "stack and project_id required"}), 400
    return jsonify({"approved": has_approved(stack, pid, action),
                    "pending": bool(latest_pending(stack, pid, action))})


@bp.route('/api/approvals/chain', methods=['POST'])
@require_project_access
def api_create_approval_chain():
    from services.approval_service import create_approval_chain
    data = request.get_json(silent=True) or {}
    stack = (data.get("stack") or "").strip()
    action = (data.get("action") or "").strip().lower()
    pid = data.get("project_id") or _get_pid_raw(lambda: None)
    steps = data.get("steps") or ["tech-lead", "devops"]
    if not stack or not pid:
        return jsonify({"error": "stack and project_id required"}), 400
    if action not in ACTIONS:
        return jsonify({"error": f"action must be one of {ACTIONS}"}), 400
    rec = create_approval_chain(stack, pid, action, steps=steps, requested_by=_who(), note=(data.get("note") or ""))
    return jsonify({"success": True, "approval": rec}), 201


@bp.route('/api/approvals/<approval_id>/step', methods=['POST'])
@require_project_access
def api_approve_step(approval_id):
    from services.approval_service import approve_chain_step
    data = request.get_json(silent=True) or {}
    step_name = data.get("step") or data.get("step_name")
    decision = data.get("decision") or "approved"
    try:
        rec = approve_chain_step(approval_id, step_name=step_name, approver=_who(), decision=decision)
        return jsonify({"success": True, "approval": rec}), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

