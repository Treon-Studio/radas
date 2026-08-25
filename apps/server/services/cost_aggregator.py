"""Cost aggregation, forecast & breakdown (Fase 3 — UC 29/31/33)."""
from __future__ import annotations

import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List


def _amount(e: Dict[str, Any]) -> float:
    for k in ("total_cost", "estimated_cost", "cost", "amount", "monthly_cost"):
        v = e.get(k)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    return 0.0


def _month(ts: float) -> str:
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m")
    except Exception:
        return "unknown"


def list_estimates(project_id: str) -> List[Dict[str, Any]]:
    try:
        from storage.cost_store import list_estimates as _le
        return _le(project_id)
    except Exception:
        return []


def monthly(project_id: str) -> List[Dict[str, Any]]:
    buckets: Dict[str, float] = defaultdict(float)
    for e in list_estimates(project_id):
        buckets[_month(float(e.get("created_at") or time.time()))] += _amount(e)
    out = [{"month": m, "total": round(v, 2)} for m, v in sorted(buckets.items())]
    return out


def forecast(project_id: str, months: int = 3) -> Dict[str, Any]:
    series = monthly(project_id)
    if len(series) < 2:
        avg = series[0]["total"] if series else 0.0
        return {"base": round(avg, 2), "predicted": [round(avg, 2)] * months, "method": "flat"}
    xs = list(range(len(series)))
    ys = [p["total"] for p in series]
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sum((x - mx) ** 2 for x in xs) or 1)
    inter = my - slope * mx
    pred = [round(max(0.0, inter + slope * (len(series) + i)), 2) for i in range(1, months + 1)]
    return {"base": round(ys[-1], 2), "trend": round(slope, 2), "predicted": pred, "method": "linear"}


def breakdown(project_id: str, by: str = "provider") -> List[Dict[str, Any]]:
    buckets: Dict[str, float] = defaultdict(float)
    for e in list_estimates(project_id):
        key = e.get(by) or e.get(f"{by}_name") or (e.get("stack") if by == "stack" else None) or "other"
        buckets[str(key)] += _amount(e)
    out = [{"key": k, "total": round(v, 2)} for k, v in sorted(buckets.items(), key=lambda kv: -kv[1])]
    return out


def rollup() -> Dict[str, Any]:
    try:
        from services.cloud_provisioning import PROJECTS_DIR
    except Exception:
        return {"projects": []}
    rows = []
    grand = 0.0
    if PROJECTS_DIR.exists():
        for d in sorted(PROJECTS_DIR.iterdir()):
            if not d.is_dir():
                continue
            pid = d.name
            ests = list_estimates(pid)
            total = round(sum(_amount(e) for e in ests), 2)
            grand += total
            rows.append({"project_id": pid, "total": total, "estimates": len(ests)})
    return {"projects": rows, "grand_total": round(grand, 2)}
