"""Per-project quota & limits (Fase 2 — UC 69)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, Optional


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "quotas.json"
    except Exception:
        return Path("data") / "quotas.json"


def load_quotas() -> Dict[str, Any]:
    try:
        p = _store_path()
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def get_quota(project_id: str) -> Optional[Dict[str, Any]]:
    return load_quotas().get(project_id)


def save_quota(project_id: str, max_stacks: int, max_vms: int, max_cost_monthly: float) -> Dict[str, Any]:
    quotas = load_quotas()
    quotas[project_id] = {
        "project_id": project_id,
        "max_stacks": max(0, int(max_stacks)),
        "max_vms": max(0, int(max_vms)),
        "max_cost_monthly": max(0.0, float(max_cost_monthly)),
        "updated_at": time.time(),
    }
    p = _store_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(quotas, indent=2), encoding="utf-8")
    return quotas[project_id]


def delete_quota(project_id: str) -> bool:
    quotas = load_quotas()
    if project_id not in quotas:
        return False
    quotas.pop(project_id)
    _store_path().write_text(json.dumps(quotas, indent=2), encoding="utf-8")
    return True


def stack_usage(project_id: str) -> int:
    try:
        from services.cloud_provisioning import _stack_data_dir
        base = _stack_data_dir(project_id, "_").parent
        if not base.exists():
            return 0
        return sum(1 for d in base.iterdir() if d.is_dir() and (d / "meta.json").exists())
    except Exception:
        return 0


def check_quota(project_id: str, kind: str = "stacks") -> Dict[str, Any]:
    """Return {allowed: bool, reason: str, usage: int, limit: int}."""
    quota = get_quota(project_id)
    if not quota:
        return {"allowed": True, "reason": "", "usage": 0, "limit": 0}
    if kind == "stacks":
        usage = stack_usage(project_id)
        limit = int(quota.get("max_stacks") or 0)
        if limit and usage >= limit:
            return {"allowed": False,
                    "reason": f"Quota exceeded: {usage}/{limit} stacks (raise the limit in Settings → Quota).",
                    "usage": usage, "limit": limit}
        return {"allowed": True, "reason": "", "usage": usage, "limit": limit}
    return {"allowed": True, "reason": "", "usage": 0, "limit": 0}
