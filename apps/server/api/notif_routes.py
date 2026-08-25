"""Notification preferences routes (Fase 5 — UC 84)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.notif_prefs import get_prefs, save_prefs

bp = Blueprint("notif_api", __name__)


def _uid():
    cu = getattr(request, "current_user", {}) or {}
    return cu.get("user_id") or ""


@bp.route('/api/notifications/prefs', methods=['GET'])
@require_auth
def api_get_prefs():
    return jsonify({"prefs": get_prefs(_uid())})


@bp.route('/api/notifications/prefs', methods=['PUT'])
@require_auth
def api_put_prefs():
    data = request.get_json(silent=True) or {}
    return jsonify({"success": True, "prefs": save_prefs(_uid(), data)})
