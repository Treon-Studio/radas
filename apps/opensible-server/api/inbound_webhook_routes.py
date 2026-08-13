"""Inbound webhook routes (Fase 5 — UC 53/81)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from services.inbound_webhooks import create, delete, load, trigger
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("inbound_webhook_api", __name__)

ACTIONS = ("plan", "apply", "destroy", "refresh", "validate", "fmt")


@bp.route('/api/inbound-webhooks', methods=['GET'])
@require_project_access
def api_list_inbound():
    items = []
    for w in load():
        w2 = dict(w)
        w2.pop("secret", None)
        items.append(w2)
    return jsonify({"inbound_webhooks": items})


@bp.route('/api/inbound-webhooks', methods=['POST'])
@require_project_access
def api_create_inbound():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    secret = data.get("secret") or ""
    stack = (data.get("stack") or "").strip()
    action = (data.get("action") or "plan").strip().lower()
    pid = data.get("project_id") or _get_pid_raw(lambda: None)
    if not name or not stack or not pid:
        return jsonify({"error": "name, stack and project_id required"}), 400
    if action not in ACTIONS:
        return jsonify({"error": f"action must be one of {ACTIONS}"}), 400
    rec = create(name, secret, stack, action, pid)
    rec.pop("secret", None)
    return jsonify({"success": True, "inbound_webhook": rec}), 201


@bp.route('/api/inbound-webhooks/<webhook_id>', methods=['DELETE'])
@require_project_access
def api_delete_inbound(webhook_id):
    if not delete(webhook_id):
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True})


@bp.route('/api/webhooks/inbound/<name>', methods=['POST'])
def api_trigger_inbound(name):
    """Public endpoint — external systems (GitHub/GitLab) POST here.
    Auth is the HMAC signature (X-Hub-Signature-256 or X-Radas-Signature)."""
    body = request.get_data()
    signature = (request.headers.get("X-Hub-Signature-256")
                 or request.headers.get("X-Radas-Signature"))
    ok, status = trigger(name, body, signature)
    return jsonify(ok), status
