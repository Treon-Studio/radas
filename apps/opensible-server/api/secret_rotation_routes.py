"""Secret rotation route (Fase 2 — UC 36)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.secret_rotation import rotate_stack_secrets
from services.cloud_provisioning import _stack_dir
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("secret_rotation_api", __name__)


@bp.route('/api/cloud/stacks/<name>/secrets/rotate', methods=['POST'])
@require_auth
def api_rotate_secrets(name):
    pid = _get_pid_raw(lambda: None)
    if not pid or not _stack_dir(pid, name).exists():
        return jsonify({"error": "Not found"}), 404
    keys = request.get_json(silent=True) or {}
    keys_list = keys.get("keys") or None
    rotated = rotate_stack_secrets(pid, name, keys=keys_list)
    if not rotated:
        return jsonify({"error": "No secrets to rotate for this stack"}), 400
    return jsonify({"success": True, "rotated": rotated})
