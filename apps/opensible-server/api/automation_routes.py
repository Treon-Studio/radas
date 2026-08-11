"""Automation rules routes (Fase 5 — UC 23/78/80)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.automation_rules import create, delete, in_maintenance, load, run_rules_once, update

bp = Blueprint("automation_api", __name__)

KINDS = ("maintenance", "auto_stop", "remediate")


@bp.route('/api/automation/rules', methods=['GET'])
@require_auth
def api_list_rules():
    return jsonify({"rules": load()})


@bp.route('/api/automation/rules', methods=['POST'])
@require_auth
def api_create_rule():
    data = request.get_json(silent=True) or {}
    kind = (data.get("kind") or "").strip().lower()
    if kind not in KINDS:
        return jsonify({"error": f"kind must be one of {KINDS}"}), 400
    rule = create(data)
    return jsonify({"success": True, "rule": rule}), 201


@bp.route('/api/automation/rules/<rule_id>', methods=['PATCH'])
@require_auth
def api_update_rule(rule_id):
    r = update(rule_id, request.get_json(silent=True) or {})
    if not r:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "rule": r})


@bp.route('/api/automation/rules/<rule_id>', methods=['DELETE'])
@require_auth
def api_delete_rule(rule_id):
    if not delete(rule_id):
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True})


@bp.route('/api/automation/rules/run-now', methods=['POST'])
@require_auth
def api_run_rules():
    return jsonify({"queued": run_rules_once()})


@bp.route('/api/automation/maintenance', methods=['GET'])
@require_auth
def api_maintenance_status():
    return jsonify({"active": in_maintenance()})
