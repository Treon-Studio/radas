"""Global search API (UC396)."""

from __future__ import annotations

from flask import Blueprint, request

from auth.middleware import require_auth
from services import global_search
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("search_api", __name__)


@bp.route("/api/search", methods=["GET"])
@require_auth
def api_search():
    """Global search across stacks, runs, and secrets.

    Query params:
        q: Search string (required, min 2 chars)
        project_id: Optional project scope
        limit: Max results per category (default 20, max 100)
    """
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return {"error": "Search query must be at least 2 characters"}, 400

    project_id = request.args.get("project_id") or _get_pid_raw(lambda: None)
    try:
        limit = int(request.args.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 100))

    results = global_search.search(q, project_id=project_id, limit=limit)
    return results