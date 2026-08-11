"""AI routes (Fase 4 — UC 89/90/91/93)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from services.ai_service import chat, is_configured, playbook_draft, review_plan, stack_docs
from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("ai_api", __name__)


def _pid():
    return request.args.get("project_id") or _get_pid_raw(lambda: None)


@bp.route('/api/ai/status', methods=['GET'])
@require_auth
def api_ai_status():
    return jsonify({"configured": is_configured()})


@bp.route('/api/ai/chat', methods=['POST'])
@require_auth
def api_ai_chat():
    data = request.get_json(silent=True) or {}
    msg = (data.get("message") or "").strip()
    if not msg:
        return jsonify({"error": "message required"}), 400
    ctx = ""
    if data.get("stack"):
        try:
            ctx = stack_docs(_pid() or "", data["stack"])["markdown"][:2000]
        except Exception:
            ctx = ""
    return jsonify(chat(msg, ctx))


@bp.route('/api/ai/review-plan', methods=['POST'])
@require_auth
def api_ai_review_plan():
    data = request.get_json(silent=True) or {}
    plan = data.get("plan_text") or ""
    if not plan:
        return jsonify({"error": "plan_text required"}), 400
    return jsonify(review_plan(plan, data.get("context") or ""))


@bp.route('/api/ai/playbook-draft', methods=['POST'])
@require_auth
def api_ai_playbook_draft():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "prompt required"}), 400
    return jsonify(playbook_draft(prompt))


@bp.route('/api/ai/stack-docs', methods=['POST'])
@require_auth
def api_ai_stack_docs():
    data = request.get_json(silent=True) or {}
    stack = (data.get("stack") or "").strip()
    if not stack:
        return jsonify({"error": "stack required"}), 400
    return jsonify(stack_docs(_pid() or "", stack))
