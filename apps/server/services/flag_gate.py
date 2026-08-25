"""Fail-closed feature flag gates for worker/automation mutations."""
from __future__ import annotations

def mutation_blocked(action: str, env: str = "prod", user: str = "", project_id: str | None = None, org_id: str | None = None) -> dict:
    try:
        from services.feature_flag_registry import evaluate
        key = "block_destroy" if action == "destroy" else "block_apply"
        result = evaluate(key, env=env, user=user, project_id=project_id, org_id=org_id)
        return {"blocked": bool(result.get("enabled")), "reason": result.get("reason", "")}
    except Exception as exc:
        return {"blocked": True, "reason": "flag_evaluation_error", "error": str(exc)[:200]}
