"""AI/rule-based automation roadmap (Fase 5 — UC 85)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

try:
    from auth.middleware import require_auth, require_project_access
except ImportError:
    from ..auth.middleware import require_auth

from utils.request_ctx import get_project_id_from_request as _get_pid_raw

bp = Blueprint("ai_roadmap_api", __name__)


@bp.route('/api/ai/roadmap', methods=['POST'])
@require_project_access
def api_ai_roadmap():
    pid = request.get_json(silent=True) or {}
    project_id = pid.get("project_id") or _get_pid_raw(lambda: None)
    if not project_id:
        return jsonify({"error": "project required"}), 400
    steps = []
    try:
        from services.cloud_provisioning import _stack_data_dir
        base = _stack_data_dir(project_id, "_").parent
        stacks = []
        if base.exists():
            for d in sorted(base.iterdir()):
                mp = d / "meta.json"
                if mp.exists():
                    import json as _j
                    stacks.append(_j.loads(mp.read_text(encoding="utf-8")))
        if not stacks:
            steps.append("Create your first stack from Cloud Stacks > New Stack (pick a provider).")
        for s in stacks:
            name = s.get("name") or "?"
            env = s.get("env") or "dev"
            if env == "prod" and s.get("approval_required") is not True:
                steps.append(f"Enable approval for prod stack '{name}' (Stack > Approvals).")
        try:
            from services.quota_service import get_quota
            if get_quota(project_id) is None:
                steps.append("Set a project quota (Settings > Project Quota) to cap cost/stacks.")
        except Exception:
            pass
        try:
            from services.budget_service import get_budget
            if get_budget(project_id) is None:
                steps.append("Set a budget with alert threshold (Cost > Budget).")
        except Exception:
            pass
        try:
            from services.webhook_dispatcher import load_webhooks
            if not load_webhooks():
                steps.append("Add an outbound webhook (Settings > Webhooks) for run events.")
        except Exception:
            pass
        if not steps:
            steps.append("All recommended guardrails are in place. Next: Fase 3 cost insights & Fase 4 AI tools.")
    except Exception as e:
        steps = [f"Roadmap generation error: {e}"]
    return jsonify({"project_id": project_id, "steps": steps})
