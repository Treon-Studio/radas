"""Rightsizing heuristics (Fase 3 — UC 32).

Heuristic-first: stacks with no recorded run activity for > 30 days are
flagged as idle candidates for review/stop. Real utilization data (agent)
can replace this later.
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List


def recommendations(project_id: str, idle_days: int = 30) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    try:
        from services.cloud_provisioning import _stack_data_dir
        from services.execution_history import list_executions
        base = _stack_data_dir(project_id, "_").parent
        if not base.exists():
            return out
        now = time.time()
        for d in sorted(base.iterdir()):
            meta_p = d / "meta.json"
            if not meta_p.exists():
                continue
            try:
                meta = json.loads(meta_p.read_text(encoding="utf-8"))
            except Exception:
                continue
            name = meta.get("name") or d.name
            # activity: latest execution for this project
            last_activity = meta.get("updated_at") or meta.get("created_at") or 0
            try:
                execs = list_executions(limit=10, project_id=project_id)
                for e in execs:
                    ts = e.get("createdAt") or e.get("startedAt") or 0
                    if ts and ts > last_activity:
                        last_activity = ts
            except Exception:
                pass
            idle = (now - float(last_activity)) > idle_days * 86400
            if idle:
                out.append({
                    "stack": name,
                    "provider": meta.get("provider"),
                    "idle_days": round((now - float(last_activity)) / 86400, 1),
                    "suggestion": "Review for stop/downsize (no activity > %dd)" % idle_days,
                    "action": "review",
                })
    except Exception:
        pass
    return out
