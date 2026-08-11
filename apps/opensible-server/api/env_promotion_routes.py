"""Environment promotion route (Fase 5 — UC 52)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.env_promotion import promote
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("env_promotion_api", __name__)


@bp.route('/api/cloud/stacks/promote', methods=['POST'])
@require_auth
def api_promote():
    pid = _get_pid_raw(lambda: None)
    data = request.get_json(silent=True) or {}
    frm = (data.get("from_stack") or "").strip()
    to = (data.get("to_stack") or "").strip()
    if not pid or not frm or not to:
        return jsonify({"error": "from_stack, to_stack and project required"}), 400
    try:
        result = promote(pid, frm, to)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, **result}), 201
