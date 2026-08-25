"""GraphQL API Gateway route and query execution engine (UC639)."""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Optional

from flask import Blueprint, jsonify, request

from services.component_status import get_component_health_status
from services.openapi_generator import get_api_schema_version
from storage import pg

logger = logging.getLogger(__name__)
graphql_bp = Blueprint("graphql_routes", __name__)


def execute_graphql_query(query_str: str, variables: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Execute simple GraphQL queries against internal services and PostgreSQL database (UC639)."""
    if not query_str:
        return {"errors": [{"message": "Empty query string"}]}

    cleaned = " ".join(query_str.split())
    data: Dict[str, Any] = {}

    # 1. health query
    if re.search(r"\bhealth\b", cleaned):
        h_status = get_component_health_status()
        data["health"] = {
            "status": h_status.get("status", "operational"),
            "timestamp": h_status.get("timestamp"),
            "components": h_status.get("components", []),
        }

    # 2. schemaVersion query
    if re.search(r"\bschemaVersion\b", cleaned):
        data["schemaVersion"] = get_api_schema_version()

    # 3. stacks query
    if re.search(r"\bstacks\b", cleaned):
        match_proj = re.search(r'projectId\s*:\s*"([^"]+)"', cleaned)
        project_id = match_proj.group(1) if match_proj else None
        if not project_id and variables:
            project_id = variables.get("projectId")

        query_sql = "SELECT project_id, stack, data FROM stack_meta"
        params = ()
        if project_id:
            query_sql += " WHERE project_id = %s"
            params = (project_id,)

        rows = pg.query_all(query_sql, params)
        stacks_list = []
        for r in rows:
            meta = r.get("data") or {}
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except Exception:
                    meta = {}
            stacks_list.append({
                "projectId": r.get("project_id"),
                "stack": r.get("stack"),
                "provider": meta.get("provider", "unknown"),
                "monthlyCost": float(meta.get("monthly_cost") or meta.get("estimated_monthly_cost") or 0.0),
            })
        data["stacks"] = stacks_list

    return {"data": data}


@graphql_bp.route("/api/graphql", methods=["POST"])
def handle_graphql():
    """Handle incoming GraphQL POST requests."""
    body = request.get_json(silent=True) or {}
    query = body.get("query", "")
    variables = body.get("variables")
    result = execute_graphql_query(query, variables)
    return jsonify(result), 200
