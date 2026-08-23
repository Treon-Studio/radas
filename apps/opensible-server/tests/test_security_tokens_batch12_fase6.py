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


def test_prune_audit_logs_retention(pg_db, data_dir):
    from services.audit_events import prune_audit_logs, search_audit_events
    from storage import pg
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    old_time_120d = (now - timedelta(days=120)).isoformat()
    old_time_40d = (now - timedelta(days=40)).isoformat()
    recent_time_10d = (now - timedelta(days=10)).isoformat()

    # Insert raw records with past dates
    pg.execute(
        "INSERT INTO audit_log(actor_user_id, action, target_type, target_id, meta_json, created_at) "
        "VALUES(%s, %s, %s, %s, %s, %s)",
        ("user-1", "old.event.120", "stack", "s1", '{"project_id": "p-prune"}', old_time_120d),
    )
    pg.execute(
        "INSERT INTO audit_log(actor_user_id, action, target_type, target_id, meta_json, created_at) "
        "VALUES(%s, %s, %s, %s, %s, %s)",
        ("user-1", "old.event.40", "stack", "s2", '{"project_id": "p-prune"}', old_time_40d),
    )
    pg.execute(
        "INSERT INTO audit_log(actor_user_id, action, target_type, target_id, meta_json, created_at) "
        "VALUES(%s, %s, %s, %s, %s, %s)",
        ("user-1", "recent.event.10", "stack", "s3", '{"project_id": "p-prune"}', recent_time_10d),
    )

    # Prune older than 90 days
    pruned = prune_audit_logs(retention_days=90, project_id="p-prune")
    assert pruned == 1

    # Remaining should be 2
    res = search_audit_events(project_id="p-prune")
    assert res["total"] == 2
    actions = [e["action"] for e in res["events"]]
    assert "old.event.120" not in actions
    assert "old.event.40" in actions
    assert "recent.event.10" in actions


