"""Compliance report & scorecard routes (Fase 2 — UC 44/45/73)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from services.compliance_service import report, scorecard
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("compliance_api", __name__)


@bp.route('/api/compliance/scorecard', methods=['GET'])
@require_project_access
def api_compliance_scorecard():
    pid = request.args.get("project_id") or _get_pid_raw(lambda: None)
    if not pid:
        return jsonify({"error": "Project required"}), 400
    return jsonify(scorecard(pid))


@bp.route('/api/compliance/report', methods=['GET'])
@require_project_access
def api_compliance_report():
    pid = request.args.get("project_id") or _get_pid_raw(lambda: None)
    if not pid:
        return jsonify({"error": "Project required"}), 400
    return jsonify(report(pid))
