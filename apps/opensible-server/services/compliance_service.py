"""Compliance report & scorecard (Fase 2 — UC 44/45/73)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List


def _auth_db() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "auth" / "auth.db"
    except Exception:
        return Path("data") / "auth" / "auth.db"


def _query(sql: str, params: tuple = ()) -> List[tuple]:
    try:
        from storage import pg
        rows = pg.query_all(sql.replace("?", "%s"), params)
        if not rows:
            return []
        cols = list(rows[0].keys())
        return [tuple(r[c] for c in cols) for r in rows]
    except Exception:
        return []


def audit_summary(days: int = 7) -> Dict[str, Any]:
    cutoff = time.time() - days * 86400
    rows = _query("SELECT action, COUNT(*) FROM audit_log WHERE created_at >= ? GROUP BY action",
                  (cutoff,))
    failed = sum(c for a, c in rows if "fail" in (a or "").lower() or a in ("login.failed", "LOGIN_FAILED"))
    return {"total": sum(c for _, c in rows), "by_action": dict(rows), "failed_logins": failed}


def recent_audit(limit: int = 20) -> List[Dict[str, Any]]:
    rows = _query(
        "SELECT actor_user_id, action, target_type, target_id, created_at FROM audit_log "
        "ORDER BY created_at DESC LIMIT ?", (limit,))
    return [{"actor": r[0], "action": r[1], "target": r[2], "target_id": r[3], "at": r[4]} for r in rows]


def mfa_users() -> int:
    rows = _query("SELECT COUNT(*) FROM users WHERE mfa_secret IS NOT NULL AND mfa_secret != ''")
    return rows[0][0] if rows else 0


def prod_stacks_without_approval(project_id: str) -> List[str]:
    out = []
    try:
        from services.cloud_provisioning import _list_stacks
        for st in _list_stacks(project_id):
            if st.get("env") == "prod" and st.get("approval_required") is not True:
                out.append(st.get("name"))
    except Exception:
        pass
    return out


def scorecard(project_id: str) -> Dict[str, Any]:
    checks: List[Dict[str, Any]] = []

    try:
        from services.quota_service import get_quota
        has_quota = get_quota(project_id) is not None
    except Exception:
        has_quota = False
    checks.append({"id": "quota", "label": "Project quota configured", "ok": has_quota, "weight": 20})

    prod_missing = prod_stacks_without_approval(project_id)
    checks.append({"id": "approval", "label": "Prod stacks require approval",
                   "ok": len(prod_missing) == 0, "weight": 20,
                   "detail": f"{len(prod_missing)} prod stack(s) without approval" if prod_missing else ""})

    try:
        from services.webhook_dispatcher import load_webhooks
        from services.budget_service import get_budget
        has_notif = bool(load_webhooks()) or get_budget(project_id) is not None
    except Exception:
        has_notif = False
    checks.append({"id": "notify", "label": "Webhook or budget configured", "ok": has_notif, "weight": 10})

    audit = audit_summary(7)
    low_fail = audit["failed_logins"] <= 5
    checks.append({"id": "logins", "label": "Low failed-login count (7d)",
                   "ok": low_fail, "weight": 20, "detail": f"{audit['failed_logins']} failed"})

    mfa = mfa_users()
    checks.append({"id": "mfa", "label": "MFA enabled on accounts", "ok": mfa > 0, "weight": 10,
                   "detail": f"{mfa} user(s) with MFA" if mfa else ""})

    checks.append({"id": "audit", "label": "Audit activity present", "ok": audit["total"] > 0, "weight": 10,
                   "detail": f"{audit['total']} events (7d)"})

    score = sum(c["weight"] for c in checks if c["ok"])
    return {"score": score, "max": 100, "checks": checks, "project_id": project_id}


def report(project_id: str) -> Dict[str, Any]:
    audit = audit_summary(30)
    prod_missing = prod_stacks_without_approval(project_id)
    return {
        "audit_30d": audit,
        "recent": recent_audit(20),
        "prod_stacks_without_approval": prod_missing,
        "mfa_users": mfa_users(),
        "scorecard": scorecard(project_id),
    }
