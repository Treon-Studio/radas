#!/usr/bin/env python3
"""
Login security and brute force rate limiting service (UC618).
Tracks failed login attempts per username and IP address with sliding window and lockout.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Dict, List, Tuple

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_login_failures: Dict[str, List[float]] = {}
DEFAULT_MAX_FAILURES = 5
DEFAULT_WINDOW_SECONDS = 60


def _build_key(username: str, ip: str) -> str:
    user = (username or "").strip().lower()
    client_ip = (ip or "").strip()
    return f"{client_ip}|{user}"


def record_login_attempt(username: str, ip: str, success: bool) -> None:
    """Record the result of a login attempt."""
    key = _build_key(username, ip)
    with _lock:
        if success:
            _login_failures.pop(key, None)
        else:
            now = time.time()
            failures = _login_failures.setdefault(key, [])
            failures.append(now)


def is_login_rate_limited(
    username: str,
    ip: str,
    max_failures: int = DEFAULT_MAX_FAILURES,
    window_seconds: int = DEFAULT_WINDOW_SECONDS,
) -> Tuple[bool, int]:
    """
    Check if a login key is currently rate-limited.
    Returns (is_blocked, retry_after_seconds).
    """
    key = _build_key(username, ip)
    now = time.time()
    cutoff = now - window_seconds

    with _lock:
        failures = _login_failures.get(key, [])
        # Prune expired failures
        valid_failures = [t for t in failures if t > cutoff]
        _login_failures[key] = valid_failures

        if len(valid_failures) >= max_failures:
            oldest_relevant = valid_failures[0]
            retry_after = max(1, int(oldest_relevant + window_seconds - now))
            return True, retry_after
        return False, 0


def reset_login_rate_limit(username: str, ip: str) -> None:
    """Explicitly reset/clear login attempts for a key."""
    key = _build_key(username, ip)
    with _lock:
        _login_failures.pop(key, None)
