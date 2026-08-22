"""API routes for branch-to-environment mapping (UC339)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth, require_project_access

from services import branch_mapping
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("branch_mapping_api", __name__)


@bp.route("/api/projects/<project_id>/stacks/<stack>/branch-mapping", methods=["GET"])
@require_project_access
def get_branch_mapping(project_id: str, stack: str):
    """Get the branch mapping rules for a stack."""
    rules = branch_mapping.get_mapping(project_id, stack)
    return jsonify({"rules": rules})


@bp.route("/api/projects/<project_id>/stacks/<stack>/branch-mapping", methods=["PUT"])
@require_project_access
def put_branch_mapping(project_id: str, stack: str):
    """Replace the branch mapping rules for a stack."""
    body = request.get_json(silent=True) or {}
    rules = body.get("rules")
    if not isinstance(rules, list):
        return jsonify({"error": "rules must be a list"}), 400
    try:
        branch_mapping.set_mapping(project_id, stack, rules)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True})


@bp.route("/api/projects/<project_id>/stacks/<stack>/resolve-branch", methods=["POST"])
@require_project_access
def resolve_branch(project_id: str, stack: str):
    """Resolve a branch to its target environment and optional stack override."""
    body = request.get_json(silent=True) or {}
    branch = (body.get("branch") or "").strip()
    if not branch:
        return jsonify({"error": "branch required"}), 400
    result = branch_mapping.resolve_environment(project_id, stack, branch)
    return jsonify(result)