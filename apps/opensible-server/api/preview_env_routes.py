"""Preview environment routes (Fase 5 — UC 49)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from services.preview_envs import (
    create, handle_github_event, list_previews, teardown, verify_github_signature,
    webhook_secret,
)
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("preview_env_api", __name__)


def _pid():
    return request.args.get("project_id") or _get_pid_raw(lambda: None)


@bp.route('/api/preview-envs', methods=['GET'])
@require_project_access
def api_list_previews():
    return jsonify({"previews": list_previews(_pid())})


@bp.route('/api/preview-envs', methods=['POST'])
@require_project_access
def api_create_preview():
    data = request.get_json(silent=True) or {}
    base = (data.get("base_stack") or "").strip()
    try:
        pr = int(data.get("pr_number") or 0)
    except (TypeError, ValueError):
        return jsonify({"error": "pr_number must be an integer"}), 400
    if not base or pr <= 0:
        return jsonify({"error": "base_stack and pr_number required"}), 400
    try:
        rec = create(_pid(), base, pr, repo=data.get("repo") or "", refresh=bool(data.get("refresh")))
    except ValueError as e:
        return jsonify({"error": str(e)}), 409
    return jsonify({"success": True, "preview": rec}), 201


@bp.route('/api/preview-envs/<name>', methods=['DELETE'])
@require_project_access
def api_teardown_preview(name):
    force = request.args.get("force") in ("1", "true", "yes")
    try:
        rec = teardown(_pid(), name, force=force)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    return jsonify({"success": True, "preview": rec})


@bp.route('/api/webhooks/github/preview', methods=['POST'])
def api_github_preview_webhook():
    """Public endpoint for GitHub `pull_request` events (UC 49).

    Verify with X-Hub-Signature-256 using PREVIEW_WEBHOOK_SECRET. The base
    stack is taken from the `stack` query param, or looked up by matching the
    repo on existing stacks.
    """
    try:
        secret = webhook_secret()
    except RuntimeError:
        # Keep the public endpoint fail-closed without exposing configuration
        # details or any secret value to callers.
        return jsonify({"error": "preview webhook is not configured"}), 503

    body = request.get_data()
    signature = request.headers.get("X-Hub-Signature-256")
    if not verify_github_signature(secret, body, signature):
        return jsonify({"error": "invalid signature"}), 401
    try:
        payload = request.get_json(silent=True) or {}
    except Exception:
        payload = {}
    event = request.headers.get("X-GitHub-Event") or "push"
    if event != "pull_request":
        return jsonify({"ok": True, "ignored": True, "event": event})
    stack = (request.args.get("stack") or "").strip() or None
    out = handle_github_event(payload, stack=stack)
    status = 200 if out.get("ok") else 400
    return jsonify(out), status
