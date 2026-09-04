"""In-process sliding-window rate limiter for the RADAS 9Router module.

Per-org/per-provider counters are intentionally in-memory: a single Flask
process serves a burst consistently and the limiter fails open across restarts
rather than blocking legitimate traffic. Durable per-org quotas belong in
PostgreSQL and are a later phase (see 9router-parity.md).
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque, Dict, Tuple

_LOCK = threading.Lock()
_WINDOWS: Dict[Tuple[str, str], Deque[float]] = {}
_WINDOW_SECONDS = 60.0


def allow(org_id: str, provider_name: str, limit_per_min: int, *, now: float | None = None) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds) for one request."""
    if limit_per_min <= 0:
        return True, 0
    key = (org_id, provider_name)
    current = now if now is not None else time.time()
    with _LOCK:
        window = _WINDOWS.get(key)
        if window is None:
            window = deque()
            _WINDOWS[key] = window
        while window and current - window[0] >= _WINDOW_SECONDS:
            window.popleft()
        if len(window) >= limit_per_min:
            retry_after = max(1, int(_WINDOW_SECONDS - (current - window[0])) + 1)
            return False, retry_after
        window.append(current)
        return True, 0
