"""Prometheus metrics (Fase 5 — UC 62)."""
from __future__ import annotations

import json
import time
from collections import Counter
from pathlib import Path
from typing import Dict


def _data_dir() -> Path:
    try:
        import app as _app
        return Path(getattr(_app, "DATA_DIR", "data"))
    except Exception:
        return Path("data")


def execution_counts() -> Dict[str, int]:
    counter: Counter = Counter()
    base = _data_dir() / "projects"
    if base.exists():
        for proj in base.iterdir():
            ed = proj / "history" / "executions"
            if not ed.exists():
                continue
            for f in ed.glob("*.json"):
                try:
                    status = (json.loads(f.read_text(encoding="utf-8")) or {}).get("status", "UNKNOWN")
                except Exception:
                    status = "UNKNOWN"
                counter[str(status).upper()] += 1
    return dict(counter)


def stacks_total() -> int:
    n = 0
    base = _data_dir() / "projects"
    if base.exists():
        for proj in base.iterdir():
            cd = proj / ".cloud-provisioning"
            if cd.exists():
                n += sum(1 for d in cd.iterdir() if d.is_dir() and (d / "meta.json").exists())
    return n


def workers_online() -> int:
    try:
        from services.worker_registry import get_worker_registry
        reg = get_worker_registry()
        return len(reg.list_workers() or []) if hasattr(reg, "list_workers") else 0
    except Exception:
        return 0


def counters() -> Dict[str, int]:
    return {
        "executions": sum(execution_counts().values()),
        "stacks": stacks_total(),
        "workers_online": workers_online(),
        "webhooks": _json_len("webhooks.json"),
        "approvals_pending": _json_len("approvals.json", key="status", value="pending"),
    }


def _json_len(name: str, key: str = None, value: str = None) -> int:
    try:
        p = _data_dir() / name
        if not p.exists():
            return 0
        d = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(d, list):
            if key:
                return sum(1 for x in d if x.get(key) == value)
            return len(d)
        if isinstance(d, dict):
            return len(d)
    except Exception:
        pass
    return 0


def render_prometheus() -> str:
    c = counters()
    ec = execution_counts()
    lines = ["# HELP radas_executions_total Executions by terminal status.",
             "# TYPE radas_executions_total counter"]
    for status, n in sorted(ec.items()):
        lines.append(f'radas_executions_total{{status="{status}"}} {n}')
    lines.append("# HELP radas_stacks_total Total managed stacks.")
    lines.append("# TYPE radas_stacks_total gauge")
    lines.append(f"radas_stacks_total {c['stacks']}")
    lines.append("# HELP radas_workers_online Workers currently registered.")
    lines.append("# TYPE radas_workers_online gauge")
    lines.append(f"radas_workers_online {c['workers_online']}")
    lines.append("# HELP radas_webhooks_total Configured outbound webhooks.")
    lines.append("# TYPE radas_webhooks_total gauge")
    lines.append(f"radas_webhooks_total {c['webhooks']}")
    lines.append("# HELP radas_approvals_pending Pending approval requests.")
    lines.append("# TYPE radas_approvals_pending gauge")
    lines.append(f"radas_approvals_pending {c['approvals_pending']}")
    lines.append("# HELP radas_process_started_seconds Process start (server boot).")
    lines.append("# TYPE radas_process_started_seconds gauge")
    lines.append(f"radas_process_started_seconds {int(time.time())}")
    return "\n".join(lines) + "\n"
