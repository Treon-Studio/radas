import pytest
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

from services.login_security import (
    record_login_attempt,
    is_login_rate_limited,
    reset_login_rate_limit,
)


def test_login_rate_limiting_brute_force():
    key = "192.168.1.100|alice"
    reset_login_rate_limit("alice", "192.168.1.100")

    # Initial state: not rate limited
    blocked, retry_after = is_login_rate_limited("alice", "192.168.1.100", max_failures=3, window_seconds=60)
    assert not blocked
    assert retry_after == 0

    # 2 failures: still allowed
    record_login_attempt("alice", "192.168.1.100", success=False)
    record_login_attempt("alice", "192.168.1.100", success=False)
    blocked, retry_after = is_login_rate_limited("alice", "192.168.1.100", max_failures=3, window_seconds=60)
    assert not blocked

    # 3rd failure: now rate limited!
    record_login_attempt("alice", "192.168.1.100", success=False)
    blocked, retry_after = is_login_rate_limited("alice", "192.168.1.100", max_failures=3, window_seconds=60)
    assert blocked
    assert retry_after > 0

    # Reset on successful login
    record_login_attempt("alice", "192.168.1.100", success=True)
    blocked, retry_after = is_login_rate_limited("alice", "192.168.1.100", max_failures=3, window_seconds=60)
    assert not blocked
