"""Durable failure/recovery metric counters (KV-backed, Task 6.3 drills).

Lives in storage/ so both storage helpers (e.g. project_admission denial
counting) and services can increment counters without a layering violation.
Counters survive restarts (kv_store table) and are rendered by
services/metrics.py as Prometheus series.
"""
from __future__ import annotations

from typing import Dict

SCOPE = "metrics_counters"


def incr(name: str, n: int = 1) -> int:
    """Increment a named counter by ``n`` and return the new value."""
    if n < 0:
        raise ValueError("counter increments must be non-negative")
    from storage.kv import kv_get, kv_set

    current = kv_get(SCOPE, name)
    value = int(current) + n if isinstance(current, (int, float)) else n
    kv_set(SCOPE, name, value)
    return value


def get(name: str) -> int:
    from storage.kv import kv_get

    current = kv_get(SCOPE, name)
    return int(current) if isinstance(current, (int, float)) else 0


def snapshot() -> Dict[str, int]:
    from storage.kv import kv_list

    out: Dict[str, int] = {}
    for row in kv_list(SCOPE):
        value = row.get("value")
        if isinstance(value, (int, float)):
            out[str(row.get("key"))] = int(value)
    return out
