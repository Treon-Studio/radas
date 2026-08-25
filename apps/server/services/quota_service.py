"""Per-project quota & limits (Fase 2 — UC 69)."""
from __future__ import annotations

import math
import time
from pathlib import Path
from typing import Any, Dict, Optional

# Upper bound for max_concurrent_runs; anything beyond is almost certainly a
# mis-paste or injection and should be rejected at the API layer.
_MAX_CONCURRENT_RUNS_LIMIT = 1_000_000


def _validate_concurrent_runs(value) -> int:
    """Return a non-negative int or raise ValueError for unsafe inputs.

    Rejects: NaN, ±Inf, negative numbers, non-numeric strings, and values
    exceeding _MAX_CONCURRENT_RUNS_LIMIT.
    """
    if value is None or value == "" or value is False or value is True:
        return 0
    try:
        # Accept strings/floats but require a finite number.
        as_float = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"max_concurrent_runs must be a number, got {value!r}")
    if not math.isfinite(as_float):
        raise ValueError(f"max_concurrent_runs must be finite, got {value!r}")
    as_int = int(as_float)
    if as_int < 0:
        raise ValueError(f"max_concurrent_runs must be >= 0, got {value!r}")
    if as_int > _MAX_CONCURRENT_RUNS_LIMIT:
        raise ValueError(
            f"max_concurrent_runs exceeds maximum allowed value of {_MAX_CONCURRENT_RUNS_LIMIT}"
        )
    return as_int


def _store_path() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data")) / "quotas.json"
    except Exception:
        return Path("data") / "quotas.json"


def load_quotas() -> Dict[str, Any]:
    try:
        from storage import kv
        v = kv.kv_load("quotas")
        return v if isinstance(v, dict) else {}
    except Exception:
        pass
    return {}


def get_quota(project_id: str) -> Optional[Dict[str, Any]]:
    return load_quotas().get(project_id)


def save_quota(project_id: str, max_stacks: int, max_vms: int, max_cost_monthly: float, max_concurrent_runs: int = 0) -> Dict[str, Any]:
    quotas = load_quotas()
    quotas[project_id] = {
        "project_id": project_id,
        "max_stacks": max(0, int(max_stacks)),
        "max_vms": max(0, int(max_vms)),
        "max_cost_monthly": max(0.0, float(max_cost_monthly)),
        "max_concurrent_runs": _validate_concurrent_runs(max_concurrent_runs),
        "updated_at": time.time(),
    }
    from storage import kv
    kv.kv_set("quotas", project_id, quotas[project_id])
    return quotas[project_id]


def delete_quota(project_id: str) -> bool:
    quotas = load_quotas()
    if project_id not in quotas:
        return False
    quotas.pop(project_id)
    from storage import kv
    kv.kv_delete("quotas", project_id)
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


def check_service_quota(project_id: str, resources: Dict[str, Any]) -> Dict[str, Any]:
    quota = get_quota(project_id)
    if not quota:
        return {"allowed": False, "reason": "Service quota policy is not configured", "code": "SERVICE_QUOTA_NOT_CONFIGURED"}
    usage = stack_usage(project_id)
    limit = int(quota.get("max_stacks") or 0)
    if limit and usage >= limit:
        return {"allowed": False, "reason": f"Service quota exceeded: {usage}/{limit} workloads", "code": "SERVICE_QUOTA_EXCEEDED", "usage": usage, "limit": limit}
    return {"allowed": True, "reason": "", "usage": usage, "limit": limit, "resources": resources}


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
