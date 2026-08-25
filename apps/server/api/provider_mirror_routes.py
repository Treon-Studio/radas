"""Provider mirror routes (Fase 5 — UC 99)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.provider_mirror import get_config, registry_tfrc, save_config

bp = Blueprint("provider_mirror_api", __name__)


@bp.route('/api/settings/provider-mirror', methods=['GET'])
@require_auth
def api_get_mirror():
    cfg = get_config()
    return jsonify({"mirror": cfg, "registry_tfrc": registry_tfrc(cfg)})


@bp.route('/api/settings/provider-mirror', methods=['PUT'])
@require_auth
def api_put_mirror():
    data = request.get_json(silent=True) or {}
    cfg = save_config(data.get("dir") or "", data.get("enabled", True))
    return jsonify({"success": True, "mirror": cfg, "registry_tfrc": registry_tfrc(cfg)})


@bp.route('/api/settings/provider-mirror', methods=['DELETE'])
@require_auth
def api_delete_mirror():
    save_config("", False)
    return jsonify({"success": True})
