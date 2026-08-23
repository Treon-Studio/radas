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


def test_search_audit_events_multi_field_and_query(pg_db, data_dir):
    from services.audit_events import record_audit_event, search_audit_events

    record_audit_event("stack.plan", actor_user_id="user-alice", target_type="stack", target_id="prod-db", meta={"project_id": "p-1", "region": "ap-southeast-1"})
    record_audit_event("stack.apply", actor_user_id="user-alice", target_type="stack", target_id="prod-db", meta={"project_id": "p-1", "region": "ap-southeast-1"})
    record_audit_event("flag.toggle", actor_user_id="user-bob", target_type="flag", target_id="dark_mode", meta={"project_id": "p-1", "key": "dark_mode"})
    record_audit_event("user.login", actor_user_id="user-carol", target_type="user", target_id="carol", meta={"project_id": "p-2", "ip": "1.2.3.4"})

    # Search by general query across fields
    res = search_audit_events(query="prod-db", project_id="p-1")
    assert res["total"] == 2
    assert len(res["events"]) == 2
    assert all(e["target_id"] == "prod-db" for e in res["events"])

    # Search by actor
    res = search_audit_events(actor_user_id="user-bob", project_id="p-1")
    assert res["total"] == 1
    assert res["events"][0]["action"] == "flag.toggle"

    # Search by action prefix/filter
    res = search_audit_events(action="stack.", project_id="p-1")
    assert res["total"] == 2

    # Pagination: limit 1, offset 1
    res = search_audit_events(project_id="p-1", limit=1, offset=1)
    assert res["total"] == 3
    assert len(res["events"]) == 1

