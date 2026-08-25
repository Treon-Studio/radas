"""Outbound webhook CRUD routes (Fase 1 — UC 95)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:  # pragma: no cover
    from ..auth.middleware import require_auth

from services.webhook_dispatcher import (
    create_webhook, delete_webhook, dispatch_event, load_webhooks, update_webhook,
)

bp = Blueprint("webhooks_api", __name__)

VALID_EVENTS = ("run.finished", "stack.applied", "stack.drifted", "budget.alert", "auth.password_reset")


@bp.route('/api/webhooks', methods=['GET'])
@require_auth
def api_list_webhooks():
    whs = load_webhooks()
    # Never leak the secret back to the client.
    for w in whs:
        w.pop("secret", None)
    return jsonify({"webhooks": whs})


@bp.route('/api/webhooks', methods=['POST'])
@require_auth
def api_create_webhook():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    events = data.get("events") or []
    if not url.startswith(("http://", "https://")):
        return jsonify({"error": "invalid url", "message": "url must start with http(s)://"}), 400
    bad = [e for e in events if e not in VALID_EVENTS]
    if bad:
        return jsonify({"error": "invalid events", "message": f"unknown events: {bad}"}), 400
    wh = create_webhook(url, events, secret=(data.get("secret") or ""))
    wh.pop("secret", None)
    return jsonify({"success": True, "webhook": wh}), 201


@bp.route('/api/webhooks/<webhook_id>', methods=['PATCH'])
@require_auth
def api_update_webhook(webhook_id):
    data = request.get_json(silent=True) or {}
    updates = {k: data[k] for k in ("url", "secret", "events", "enabled") if k in data}
    if "events" in updates:
        bad = [e for e in updates["events"] if e not in VALID_EVENTS]
        if bad:
            return jsonify({"error": "invalid events", "message": f"unknown events: {bad}"}), 400
    wh = update_webhook(webhook_id, updates)
    if not wh:
        return jsonify({"error": "not found", "message": "webhook not found"}), 404
    wh.pop("secret", None)
    return jsonify({"success": True, "webhook": wh})


@bp.route('/api/webhooks/<webhook_id>', methods=['DELETE'])
@require_auth
def api_delete_webhook(webhook_id):
    if not delete_webhook(webhook_id):
        return jsonify({"error": "not found", "message": "webhook not found"}), 404
    return jsonify({"success": True})


@bp.route('/api/webhooks/<webhook_id>/test', methods=['POST'])
@require_auth
def api_test_webhook(webhook_id):
    wh = next((w for w in load_webhooks() if w.get("id") == webhook_id), None)
    if not wh:
        return jsonify({"error": "not found", "message": "webhook not found"}), 404
    dispatch_event("run.finished", {"event": "test", "message": "test payload", "webhook_id": webhook_id})
    return jsonify({"success": True, "message": "test event dispatched"})
