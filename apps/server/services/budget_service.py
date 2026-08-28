"""Budget thresholds & alerting (Fase 1 — UC 30).

Failure semantics (Phase 5 — Task 5.5):
- Cost-storage failures are never reported as 0.0 spend: ``current_spend``
  raises and ``check_budget`` marks the result ``spend_status="unavailable"``
  with ``spend=None`` while preserving budget amount/currency.
- ``load_budgets`` keeps the ``{}`` fallback for list contexts but logs the
  stable ``budget.kv_load_failed`` event; unconfigured budgets stay
  ``{"configured": False}``.
- Budget inputs are validated: amounts must be finite, positive and bounded;
  ``alert_at_pct`` must be within 1-100.
- Alert delivery is deduplicated within ``ALERT_DEDUPE_SECONDS`` so scheduled
  checks do not spam webhooks, and failed dispatches are recorded in the
  ``budget_alert_dlq`` KV scope for retry (see
  ``list_budget_alert_failures`` / ``clear_budget_alert_failures``).
"""
from __future__ import annotations

import logging
import math
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

BUDGETS_SCOPE = "budgets"
ALERT_DLQ_SCOPE = "budget_alert_dlq"
ALERT_DEDUPE_SECONDS = 3600.0
MAX_BUDGET_AMOUNT = 1e12


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "budgets.json"
    except Exception:
        return Path("data") / "budgets.json"


def load_budgets() -> Dict[str, Any]:
    try:
        from storage import kv
        v = kv.kv_load(BUDGETS_SCOPE)
        return v if isinstance(v, dict) else {}
    except Exception as exc:
        logger.error("budget.kv_load_failed: %s", type(exc).__name__)
        return {}


def _validate_amount(amount: Any) -> float:
    try:
        value = float(amount)
    except (TypeError, ValueError):
        raise ValueError("amount must be a number")
    if math.isnan(value) or math.isinf(value):
        raise ValueError("amount must be finite")
    if value <= 0:
        raise ValueError("amount must be > 0")
    if value > MAX_BUDGET_AMOUNT:
        raise ValueError(f"amount must not exceed {MAX_BUDGET_AMOUNT:g}")
    return value


def _validate_alert_at_pct(pct: Any) -> float:
    try:
        value = float(pct)
    except (TypeError, ValueError):
        raise ValueError("alert_at_pct must be a number")
    if math.isnan(value) or math.isinf(value):
        raise ValueError("alert_at_pct must be finite")
    if not (1.0 <= value <= 100.0):
        raise ValueError("alert_at_pct must be between 1 and 100")
    return value


def save_budget(project_id: str, amount: float, currency: str, alert_at_pct: float) -> Dict[str, Any]:
    validated_amount = _validate_amount(amount)
    validated_pct = _validate_alert_at_pct(alert_at_pct)
    record = {
        "project_id": project_id,
        "amount": validated_amount,
        "currency": currency or "USD",
        "alert_at_pct": validated_pct,
        "updated_at": time.time(),
    }
    from storage import kv
    kv.kv_set(BUDGETS_SCOPE, project_id, record)
    return record


def get_budget(project_id: str) -> Optional[Dict[str, Any]]:
    return load_budgets().get(project_id)


def delete_budget(project_id: str) -> bool:
    budgets = load_budgets()
    if project_id not in budgets:
        return False
    budgets.pop(project_id)
    from storage import kv
    kv.kv_delete(BUDGETS_SCOPE, project_id)
    return True


def current_spend(project_id: str) -> float:
    """Total estimated spend for a project across all stacks/estimates.

    Raises when cost storage is unavailable — a storage outage must never be
    misread as zero spend (Task 5.5). Unparseable individual estimate values
    are skipped, as before.
    """
    from storage.cost_store import list_estimates_strict
    ests = list_estimates_strict(project_id)
    total = 0.0
    for e in ests:
        v = e.get("estimated_cost") or e.get("cost") or e.get("amount") or 0
        try:
            total += float(v)
        except (TypeError, ValueError):
            pass
    return total


def _mark_alerted(project_id: str, budget: Dict[str, Any], ts: float) -> None:
    """Record successful alert delivery on the stored budget record.

    Failure to persist the marker only risks an at-least-once duplicate on
    the next check — it must never fail the check itself.
    """
    try:
        from storage import kv
        record = dict(budget)
        record["last_alerted_at"] = ts
        kv.kv_set(BUDGETS_SCOPE, project_id, record)
    except Exception as exc:
        logger.error("budget.alert_state_write_failed: %s", type(exc).__name__)


def _record_alert_failure(project_id: str, payload: Dict[str, Any], exc: Exception) -> None:
    """Dead-letter a failed budget alert dispatch for retry (Task 5.5)."""
    try:
        from storage import kv
        entry = {
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "at": time.time(),
            "error_type": type(exc).__name__,
            "payload": payload,
        }
        kv.kv_set(ALERT_DLQ_SCOPE, entry["id"], entry)
    except Exception as dlq_exc:
        logger.error("budget.alert_dlq_write_failed: %s", type(dlq_exc).__name__)
    logger.error("budget.alert_dispatch_failed: %s", type(exc).__name__)


def list_budget_alert_failures(project_id: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    """Failed budget alert dispatches awaiting retry (newest first)."""
    try:
        from storage import kv
        rows = kv.kv_list(ALERT_DLQ_SCOPE)
    except Exception as exc:
        logger.error("budget.alert_dlq_read_failed: %s", type(exc).__name__)
        return []
    items = [r["value"] for r in rows if isinstance(r.get("value"), dict)]
    if project_id:
        items = [i for i in items if i.get("project_id") == project_id]
    items.sort(key=lambda x: x.get("at") or 0, reverse=True)
    return items[:limit]


def clear_budget_alert_failures(project_id: Optional[str] = None) -> int:
    """Remove DLQ entries (all, or one project's). Returns the removed count."""
    from storage import kv
    removed = 0
    for row in kv.kv_list(ALERT_DLQ_SCOPE):
        value = row.get("value") or {}
        if project_id and value.get("project_id") != project_id:
            continue
        kv.kv_delete(ALERT_DLQ_SCOPE, row.get("key"))
        removed += 1
    return removed


def check_budget(project_id: str) -> Dict[str, Any]:
    budget = get_budget(project_id)
    if not budget:
        return {"configured": False, "spend": 0.0, "alerted": False}

    amount = budget.get("amount") or 0
    currency = budget.get("currency") or "USD"
    alert_at_pct = budget.get("alert_at_pct", 100.0)

    try:
        spend = current_spend(project_id)
    except Exception as exc:
        # Cost storage unavailable: report unknown spend, never a false zero,
        # and do not alert on data we cannot trust.
        logger.error("budget.spend_unavailable: %s project=%s", type(exc).__name__, project_id)
        return {
            "configured": True,
            "spend": None,
            "spend_status": "unavailable",
            "budget": amount,
            "currency": currency,
            "usage_pct": None,
            "alerted": False,
        }

    pct = (spend / amount * 100.0) if amount else 0.0
    alerted = pct >= alert_at_pct

    alert_dispatched = False
    alert_deduped = False
    if alerted:
        now = time.time()
        last_alerted = float(budget.get("last_alerted_at") or 0.0)
        if (now - last_alerted) < ALERT_DEDUPE_SECONDS:
            alert_deduped = True
        else:
            payload = {
                "project_id": project_id,
                "spend": round(spend, 2),
                "budget": amount,
                "currency": currency,
                "usage_pct": round(pct, 1),
            }
            try:
                from services.webhook_dispatcher import dispatch_event
                dispatch_event("budget.alert", payload)
                alert_dispatched = True
                _mark_alerted(project_id, budget, now)
            except Exception as exc:
                _record_alert_failure(project_id, payload, exc)

    return {
        "configured": True,
        "spend": round(spend, 2),
        "spend_status": "ok",
        "budget": amount,
        "currency": currency,
        "usage_pct": round(pct, 1),
        "alerted": alerted,
        "alert_dispatched": alert_dispatched,
        "alert_deduped": alert_deduped,
    }
