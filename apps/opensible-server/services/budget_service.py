"""Budget thresholds & alerting (Fase 1 — UC 30)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, Optional


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "budgets.json"
    except Exception:
        return Path("data") / "budgets.json"


def load_budgets() -> Dict[str, Any]:
    try:
        from storage import kv
        v = kv.kv_load("budgets")
        return v if isinstance(v, dict) else {}
    except Exception:
        pass
    return {}


def save_budget(project_id: str, amount: float, currency: str, alert_at_pct: float) -> Dict[str, Any]:
    budgets = load_budgets()
    budgets[project_id] = {
        "project_id": project_id,
        "amount": amount,
        "currency": currency or "USD",
        "alert_at_pct": min(max(float(alert_at_pct), 1.0), 100.0),
        "updated_at": time.time(),
    }
    from storage import kv
    kv.kv_set("budgets", project_id, budgets[project_id])
    return budgets[project_id]


def get_budget(project_id: str) -> Optional[Dict[str, Any]]:
    return load_budgets().get(project_id)


def delete_budget(project_id: str) -> bool:
    budgets = load_budgets()
    if project_id not in budgets:
        return False
    budgets.pop(project_id)
    from storage import kv
    kv.kv_delete("budgets", project_id)
    return True


def current_spend(project_id: str) -> float:
    try:
        from storage.cost_store import list_estimates
        ests = list_estimates(project_id)
        total = 0.0
        for e in ests:
            v = e.get("estimated_cost") or e.get("cost") or e.get("amount") or 0
            try:
                total += float(v)
            except (TypeError, ValueError):
                pass
        return total
    except Exception:
        return 0.0


def check_budget(project_id: str) -> Dict[str, Any]:
    budget = get_budget(project_id)
    if not budget:
        return {"configured": False, "spend": 0.0, "alerted": False}
    spend = current_spend(project_id)
    pct = (spend / budget["amount"] * 100.0) if budget["amount"] else 0.0
    alerted = pct >= budget["alert_at_pct"]
    if alerted:
        try:
            from services.webhook_dispatcher import dispatch_event
            dispatch_event("budget.alert", {
                "project_id": project_id,
                "spend": round(spend, 2),
                "budget": budget["amount"],
                "currency": budget["currency"],
                "usage_pct": round(pct, 1),
            })
        except Exception:
            pass
    return {"configured": True, "spend": round(spend, 2), "budget": budget["amount"],
            "usage_pct": round(pct, 1), "alerted": alerted}
