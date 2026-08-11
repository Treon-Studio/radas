"""GitHub Actions management routes (Fase 6 — UC 216+)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.github_actions import (
    cancel, dispatch, list_repos, repo_workflows, rerun, scaffold_workflow, status,
    workflow_runs, workflow_templates,
)

bp = Blueprint("github_actions_api", __name__)


def _pair(data: dict) -> tuple:
    owner = (data.get("owner") or "").strip()
    repo = (data.get("repo") or "").strip()
    return owner, repo


@bp.route('/api/github/status', methods=['GET'])
@require_auth
def api_gh_status():
    return jsonify(status())


@bp.route('/api/github/repos', methods=['GET'])
@require_auth
def api_gh_repos():
    owner = (request.args.get("owner") or "").strip()
    try:
        return jsonify({"repos": list_repos(owner)})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/workflows', methods=['GET'])
@require_auth
def api_gh_workflows(owner, repo):
    try:
        return jsonify({"workflows": repo_workflows(owner, repo)})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/runs', methods=['GET'])
@require_auth
def api_gh_runs(owner, repo):
    per_page = request.args.get("per_page") or 20
    try:
        return jsonify({"runs": workflow_runs(owner, repo, per_page=int(per_page))})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/github/workflow-templates', methods=['GET'])
@require_auth
def api_gh_templates():
    return jsonify({"templates": workflow_templates()})


@bp.route('/api/github/repos/<owner>/<repo>/dispatch', methods=['POST'])
@require_auth
def api_gh_dispatch(owner, repo):
    data = request.get_json(silent=True) or {}
    out = dispatch(owner, repo, data.get("workflow_file") or "", data.get("ref") or "main", data.get("inputs"))
    return jsonify(out), 200 if out.get("ok") else 400


@bp.route('/api/github/repos/<owner>/<repo>/runs/<int:run_id>/rerun', methods=['POST'])
@require_auth
def api_gh_rerun(owner, repo, run_id):
    out = rerun(owner, repo, run_id)
    return jsonify(out), 200 if out.get("ok") else 400


@bp.route('/api/github/repos/<owner>/<repo>/runs/<int:run_id>/cancel', methods=['POST'])
@require_auth
def api_gh_cancel(owner, repo, run_id):
    out = cancel(owner, repo, run_id)
    return jsonify(out), 200 if out.get("ok") else 400


@bp.route('/api/github/repos/<owner>/<repo>/scaffold', methods=['POST'])
@require_auth
def api_gh_scaffold(owner, repo):
    data = request.get_json(silent=True) or {}
    template_id = (data.get("template") or "").strip()
    if not template_id:
        return jsonify({"error": "template required"}), 400
    try:
        out = scaffold_workflow(owner, repo, template_id, data.get("branch") or "main",
                                data.get("message") or "")
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(out), 200 if out.get("ok") else 400