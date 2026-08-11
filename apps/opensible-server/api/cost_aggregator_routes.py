"""Cost aggregation routes (Fase 3 — UC 29/31/32/33)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.cost_aggregator import breakdown, forecast, monthly, rollup
from services.rightsizing import recommendations
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("cost_aggregator_api", __name__)


def _pid():
    return request.args.get("project_id") or _get_pid_raw(lambda: None)


@bp.route('/api/cost/monthly', methods=['GET'])
@require_auth
def api_cost_monthly():
    return jsonify({"monthly": monthly(_pid() or "")})


@bp.route('/api/cost/forecast', methods=['GET'])
@require_auth
def api_cost_forecast():
    return jsonify(forecast(_pid() or ""))


@bp.route('/api/cost/breakdown', methods=['GET'])
@require_auth
def api_cost_breakdown():
    return jsonify({"breakdown": breakdown(_pid() or "", request.args.get("by") or "provider")})


@bp.route('/api/cost/rollup', methods=['GET'])
@require_auth
def api_cost_rollup():
    return jsonify(rollup())


@bp.route('/api/cost/rightsizing', methods=['GET'])
@require_auth
def api_cost_rightsizing():
    return jsonify({"recommendations": recommendations(_pid() or "")})
