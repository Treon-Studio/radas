"""Cost aggregation routes (Fase 3 — UC 29/31/32/33)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from services.cost_aggregator import breakdown, forecast, monthly, rollup
from services.rightsizing import recommendations
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("cost_aggregator_api", __name__)


def _pid():
    return request.args.get("project_id") or _get_pid_raw(lambda: None)


@bp.route('/api/cost/monthly', methods=['GET'])
@require_project_access
def api_cost_monthly():
    return jsonify({"monthly": monthly(_pid() or "")})


@bp.route('/api/cost/forecast', methods=['GET'])
@require_project_access
def api_cost_forecast():
    return jsonify(forecast(_pid() or ""))


@bp.route('/api/cost/breakdown', methods=['GET'])
@require_project_access
def api_cost_breakdown():
    return jsonify({"breakdown": breakdown(_pid() or "", request.args.get("by") or "provider")})


@bp.route('/api/cost/breakdown/by-tag', methods=['GET'])
@require_project_access
def api_cost_breakdown_by_tag():
    """Per-tag cost breakdown (UC 358/31). The ``tag`` query param is the tag key (e.g. ``owner``, ``environment``)."""
    from services.cost_tag_analytics import get_cost_analytics_by_dimension
    tag = request.args.get("tag") or "owner"
    return jsonify(get_cost_analytics_by_dimension(_pid() or "", f"tag:{tag}"))


@bp.route('/api/cost/breakdown/by-env', methods=['GET'])
@require_project_access
def api_cost_breakdown_by_env():
    """Per-environment cost breakdown (UC 414)."""
    from services.cost_breakdown import get_cost_breakdown_by_env
    return jsonify(get_cost_breakdown_by_env(_pid() or ""))


@bp.route('/api/cost/rollup', methods=['GET'])
@require_project_access
def api_cost_rollup():
    return jsonify(rollup())


@bp.route('/api/cost/rollup/org', methods=['GET'])
@require_auth
def api_cost_rollup_org():
    """Org-level budget + spend rollup across child projects (UC 553).

    Financial rollups are org-scoped secrets, so this route applies the same
    owner/admin gate as the org management routes (``_require_org_owner``).
    A member without the owner/admin role and a user with no membership in
    the org receive the identical 403 shape, so the response never leaks
    whether the org exists.
    """
    from api.org_routes import _require_org_owner
    from services.budget_rollup import rollup_org_budgets
    from storage import pg
    org_id = request.args.get("org_id") or ""
    if not org_id:
        return jsonify({"error": "org_id is required"}), 400
    if not _require_org_owner(org_id):
        return jsonify({"error": "owner/admin required"}), 403
    rows = pg.query_all("SELECT id FROM projects WHERE org_id = %s AND is_archived = 0", (org_id,))
    child_projects = []
    for r in rows:
        pid = r["id"]
        from services.budget_service import get_budget, current_spend
        b = get_budget(pid) or {}
        try:
            spend = current_spend(pid)
        except Exception:
            spend = 0.0
        child_projects.append({
            "project_id": pid,
            "budget": b.get("amount", 0.0),
            "actual_spend": spend,
        })
    return jsonify(rollup_org_budgets(org_id, child_projects))


@bp.route('/api/cost/rightsizing', methods=['GET'])
@require_project_access
def api_cost_rightsizing():
    return jsonify({"recommendations": recommendations(_pid() or "")})
