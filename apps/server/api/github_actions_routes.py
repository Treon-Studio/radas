"""GitHub Actions management routes (Fase 6 — UC 216+)."""
from __future__ import annotations

from flask import Blueprint, Response, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.github_actions import (
    cancel, dispatch, list_repos, repo_workflows, rerun, scaffold_workflow, status,
    workflow_runs, workflow_templates, workflow_detail, set_workflow_state, run_detail, run_jobs, job_logs, list_runners,
    branch_protection, set_branch_protection, required_checks_status, environment_protection, set_environment_protection,
    pending_deployments, decide_deployment, remove_runner, replace_runner_labels, watch_run, workflow_statistics, comment_on_pull_request, runner_registration_instructions,
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


@bp.route('/api/github/repos/<owner>/<repo>/statistics', methods=['GET'])
@require_auth
def api_gh_statistics(owner, repo):
    try:
        days = max(1, min(90, int(request.args.get("days", 7))))
        workflow_id = request.args.get("workflow_id")
        return jsonify(workflow_statistics(owner, repo, days, int(workflow_id) if workflow_id else None))
    except (RuntimeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/runs', methods=['GET'])
@require_auth
def api_gh_runs(owner, repo):
    per_page = request.args.get("per_page") or 20
    try:
        return jsonify({"runs": workflow_runs(owner, repo, per_page=int(per_page),
                                                status=request.args.get("status", ""),
                                                event=request.args.get("event", ""),
                                                branch=request.args.get("branch", ""),
                                                since=request.args.get("since", ""),
                                                head_sha=request.args.get("head_sha", ""),
                                                page=int(request.args.get("page", 1)))})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/github/workflow-templates', methods=['GET'])
@require_auth
def api_gh_templates():
    return jsonify({"templates": workflow_templates()})


@bp.route('/api/github/repos/<owner>/<repo>/pulls/<int:pull_number>/comments', methods=['POST'])
@require_auth
def api_gh_pr_comment(owner, repo, pull_number):
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(comment_on_pull_request(owner, repo, pull_number, data.get("body", ""), data.get("marker", "radas-plan")))
    except (RuntimeError, ValueError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/dispatch', methods=['POST'])
@require_auth
def api_gh_dispatch(owner, repo):
    data = request.get_json(silent=True) or {}
    out = dispatch(owner, repo, data.get("workflow_file") or "", data.get("ref") or "main", data.get("inputs"))
    return jsonify(out), 200 if out.get("ok") else 400


@bp.route('/api/github/repos/<owner>/<repo>/workflows/<int:workflow_id>', methods=['GET'])
@require_auth
def api_gh_workflow_detail(owner, repo, workflow_id):
    try: return jsonify(workflow_detail(owner, repo, workflow_id))
    except RuntimeError as e: return jsonify({"error": str(e)}), 400

@bp.route('/api/github/repos/<owner>/<repo>/workflows/<int:workflow_id>/<state>', methods=['POST'])
@require_auth
def api_gh_workflow_state(owner, repo, workflow_id, state):
    try: return jsonify(set_workflow_state(owner, repo, workflow_id, state))
    except (RuntimeError, ValueError) as e: return jsonify({"error": str(e)}), 400

@bp.route('/api/github/repos/<owner>/<repo>/runs/<int:run_id>', methods=['GET'])
@require_auth
def api_gh_run_detail(owner, repo, run_id):
    try: return jsonify(run_detail(owner, repo, run_id))
    except RuntimeError as e: return jsonify({"error": str(e)}), 400

@bp.route('/api/github/repos/<owner>/<repo>/runs/<int:run_id>/watch', methods=['GET'])
@require_auth
def api_gh_watch_run(owner, repo, run_id):
    try:
        timeout = max(1, min(600, int(request.args.get("timeout_seconds", 120))))
        interval = max(0.1, min(30.0, float(request.args.get("interval_seconds", 2))))
        return jsonify(watch_run(owner, repo, run_id, timeout, interval))
    except (RuntimeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/runs/<int:run_id>/jobs', methods=['GET'])
@require_auth
def api_gh_run_jobs(owner, repo, run_id):
    try: return jsonify({"jobs": run_jobs(owner, repo, run_id)})
    except RuntimeError as e: return jsonify({"error": str(e)}), 400

@bp.route('/api/github/repos/<owner>/<repo>/jobs/<int:job_id>/logs', methods=['GET'])
@require_auth
def api_gh_job_logs(owner, repo, job_id):
    try: return Response(job_logs(owner, repo, job_id), mimetype="text/plain")
    except RuntimeError as e: return jsonify({"error": str(e)}), 400

@bp.route('/api/github/repos/<owner>/<repo>/runners/registration', methods=['POST'])
@require_auth
def api_gh_runner_registration(owner, repo):
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(runner_registration_instructions(owner, repo, data.get("labels")))
    except (RuntimeError, ValueError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/runners', methods=['GET'])
@require_auth
def api_gh_runners(owner, repo):
    try: return jsonify({"runners": list_runners(owner, repo)})
    except RuntimeError as e: return jsonify({"error": str(e)}), 400

@bp.route('/api/github/repos/<owner>/<repo>/branches/<path:branch>/protection', methods=['GET'])
@require_auth
def api_gh_branch_protection(owner, repo, branch):
    try:
        return jsonify(branch_protection(owner, repo, branch))
    except (RuntimeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/branches/<path:branch>/protection', methods=['PUT'])
@require_auth
def api_gh_set_branch_protection(owner, repo, branch):
    data = request.get_json(silent=True) or {}
    try:
        out = set_branch_protection(owner, repo, branch, data.get("required_checks") or [],
                                    bool(data.get("strict", True)), bool(data.get("required_reviews", True)),
                                    bool(data.get("enforce_admins", True)))
        return jsonify(out)
    except (RuntimeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/branches/<path:branch>/required-checks', methods=['GET'])
@require_auth
def api_gh_required_checks(owner, repo, branch):
    try:
        return jsonify(required_checks_status(owner, repo, branch, request.args.get("head_sha", "")))
    except (RuntimeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/environments/<environment>/protection', methods=['GET'])
@require_auth
def api_gh_environment_protection(owner, repo, environment):
    try:
        return jsonify(environment_protection(owner, repo, environment))
    except (RuntimeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/environments/<environment>/protection', methods=['PUT'])
@require_auth
def api_gh_set_environment_protection(owner, repo, environment):
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(set_environment_protection(owner, repo, environment, data.get("reviewers") or [],
                                                  data.get("wait_timer", 0), data.get("protected_branches", True)))
    except (RuntimeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/runs/<int:run_id>/pending-deployments', methods=['GET'])
@require_auth
def api_gh_pending_deployments(owner, repo, run_id):
    try:
        return jsonify({"deployments": pending_deployments(owner, repo, run_id)})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/runs/<int:run_id>/pending-deployments/decision', methods=['POST'])
@require_auth
def api_gh_decide_deployment(owner, repo, run_id):
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(decide_deployment(owner, repo, run_id, data.get("environment_ids") or [],
                                         data.get("state") or "", data.get("comment") or ""))
    except (RuntimeError, ValueError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/runners/<int:runner_id>', methods=['DELETE'])
@require_auth
def api_gh_remove_runner(owner, repo, runner_id):
    try:
        return jsonify(remove_runner(owner, runner_id, repo, bool((request.args.get("require_offline") or "true").lower() != "false")))
    except (RuntimeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/runners/<int:runner_id>/labels', methods=['PUT'])
@require_auth
def api_gh_replace_runner_labels(owner, repo, runner_id):
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(replace_runner_labels(owner, runner_id, data.get("labels") or [], repo))
    except (RuntimeError, ValueError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400


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


@bp.route('/api/github/repos/<owner>/<repo>/secrets', methods=['GET'])
@require_auth
def api_gh_secrets(owner, repo):
    from services.github_actions import list_secrets
    try:
        return jsonify({"secrets": list_secrets(owner, repo)})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/github/repos/<owner>/<repo>/secrets', methods=['POST'])
@require_auth
def api_gh_set_secret(owner, repo):
    from services.github_actions import upsert_secret
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    value = (data.get("value") or "").strip()
    if not name or not value:
        return jsonify({"error": "name and value required"}), 400
    out = upsert_secret(owner, repo, name, value)
    return jsonify(out), 200 if out.get("ok") else 400


@bp.route('/api/github/repos/<owner>/<repo>/secrets/<secret_name>', methods=['DELETE'])
@require_auth
def api_gh_delete_secret(owner, repo, secret_name):
    from services.github_actions import delete_secret
    out = delete_secret(owner, repo, secret_name)
    return jsonify(out), 200 if out.get("ok") else 400


@bp.route('/api/github/repos/<owner>/<repo>/variables', methods=['GET'])
@require_auth
def api_gh_variables(owner, repo):
    from services.github_actions import list_variables
    try:
        return jsonify({"variables": list_variables(owner, repo)})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400


@bp.route('/api/github/runs/<int:run_id>/auto-retry', methods=['POST'])
@bp.route('/api/github/repos/<owner>/<repo>/runs/<int:run_id>/auto-retry', methods=['POST'])
@require_auth
def api_gh_auto_retry(run_id, owner=None, repo=None):
    from services.github_actions import evaluate_run_auto_retry
    data = request.get_json(silent=True) or {}
    owner = owner or data.get("owner")
    repo = repo or data.get("repo")
    if not owner or not repo:
        return jsonify({"error": "owner and repo required"}), 400

    max_retries = int(data.get("max_retries", 2))
    retry_conclusions = data.get("retry_conclusions")
    project_id = request.headers.get("X-Project-Id") or data.get("project_id")

    try:
        result = evaluate_run_auto_retry(
            owner=owner,
            repo=repo,
            run_id=run_id,
            project_id=project_id,
            max_retries=max_retries,
            retry_conclusions=retry_conclusions,
        )
        return jsonify(result), 200
    except (RuntimeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/webhooks/ingest', methods=['POST'])
@bp.route('/api/github/webhook', methods=['POST'])
def api_gh_webhook_ingest():
    from services.github_actions import ingest_github_webhook
    event = request.headers.get("X-GitHub-Event") or request.headers.get("X-Github-Event") or "webhook"
    payload = request.get_json(silent=True) or {}
    project_id = request.headers.get("X-Project-Id") or request.args.get("project_id")

    res = ingest_github_webhook(event=event, payload=payload, project_id=project_id)
    return jsonify(res), 200


@bp.route('/api/github/repos/<owner>/<repo>/metadata', methods=['GET'])
@bp.route('/api/github/repos/<owner>/<repo>', methods=['GET'])
@require_auth
def api_gh_repo_metadata(owner, repo):
    from services.github_actions import get_repo_metadata
    project_id = request.headers.get("X-Project-Id") or request.args.get("project_id")
    try:
        meta = get_repo_metadata(owner, repo, project_id=project_id)
        return jsonify(meta), 200
    except (RuntimeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400


@bp.route('/api/github/workflows/scan-secrets', methods=['POST'])
@require_auth
def api_gh_scan_secrets():
    from services.github_actions import scan_workflow_secrets_exposure
    data = request.get_json(silent=True) or {}
    content = data.get("content") or data.get("yaml_content") or ""
    res = scan_workflow_secrets_exposure(content)
    return jsonify(res), 200


@bp.route('/api/github/workflows/validate-pinning', methods=['POST'])
@require_auth
def api_gh_validate_pinning():
    from services.github_actions import validate_workflow_sha_pinning
    data = request.get_json(silent=True) or {}
    content = data.get("content") or data.get("yaml_content") or ""
    res = validate_workflow_sha_pinning(content)
    return jsonify(res), 200


@bp.route('/api/github/connection/health', methods=['GET'])
@require_auth
def api_gh_connection_health():
    from services.github_actions import check_github_connection_health
    project_id = request.headers.get("X-Project-Id") or request.args.get("project_id")
    res = check_github_connection_health(project_id=project_id)
    return jsonify(res), 200 if res.get("healthy") else 503


@bp.route('/api/github/connection/rotate-token', methods=['POST'])
@require_auth
def api_gh_rotate_token():
    from services.github_actions import rotate_github_token
    data = request.get_json(silent=True) or {}
    new_token = (data.get("token") or data.get("new_token") or "").strip()
    if not new_token:
        return jsonify({"error": "token or new_token required"}), 400

    project_id = request.headers.get("X-Project-Id") or data.get("project_id")
    try:
        res = rotate_github_token(new_token=new_token, project_id=project_id)
        return jsonify(res), 200 if res.get("ok") else 400
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400