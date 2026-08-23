import json
import pytest
from pathlib import Path

from services.global_search import search as global_search


def test_full_text_search_stacks_and_runs_and_playbooks(pg_db, data_dir, monkeypatch):
    from storage import pg
    from services.unified_search import search_all

    # 1. Seed stacks in postgres stack_meta with tags and descriptions
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s)",
        ("proj-1", "production-k8s-cluster", json.dumps({
            "provider": "hetzner",
            "env": "production",
            "description": "Main production cluster",
            "tags": ["prod", "kubernetes", "infra"],
        })),
    )
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s)",
        ("proj-1", "staging-database", json.dumps({
            "provider": "aws",
            "env": "staging",
            "description": "Postgres database instance",
            "tags": ["db", "staging"],
        })),
    )

    # 2. Seed an execution run with logs
    exec_dir = data_dir / "projects" / "proj-1" / "executions"
    exec_dir.mkdir(parents=True, exist_ok=True)
    run_file = exec_dir / "run-9988-deploy.json"
    run_file.write_text(json.dumps({
        "id": "run-9988-deploy",
        "status": "completed",
        "triggeredBy": "alice@company.com",
        "runParams": {
            "stack_name": "production-k8s-cluster",
            "action": "apply",
        },
        "startedAt": "2026-08-23T10:00:00Z",
        "finishedAt": "2026-08-23T10:05:00Z",
    }), encoding="utf-8")

    # 3. Full-text search by tag keyword 'kubernetes'
    res_k8s = search_all(query="kubernetes", project_id="proj-1")
    assert len(res_k8s["stacks"]) == 1
    assert res_k8s["stacks"][0]["name"] == "production-k8s-cluster"

    # 4. Full-text search by run triggeredBy 'alice'
    res_alice = search_all(query="alice", project_id="proj-1")
    assert len(res_alice["runs"]) == 1
    assert res_alice["runs"][0]["id"] == "run-9988-deploy"

    # 5. Full-text search matching across stacks and runs for 'production'
    res_prod = search_all(query="production", project_id="proj-1")
    assert len(res_prod["stacks"]) == 1
    assert len(res_prod["runs"]) == 1


def test_cursor_based_pagination():
    from utils.cursor_pagination import encode_cursor, decode_cursor, paginate_with_cursor

    # 1. Test encoding/decoding cursor
    cursor_str = encode_cursor({"id": "item-123", "score": 98.5})
    decoded = decode_cursor(cursor_str)
    assert decoded["id"] == "item-123"
    assert decoded["score"] == 98.5

    # 2. Test pagination across 10 items with limit=3
    dataset = [{"id": f"rec-{i:02d}", "val": i * 10} for i in range(1, 11)]

    # Page 1
    page1 = paginate_with_cursor(dataset, cursor=None, limit=3, sort_key="id")
    assert len(page1["items"]) == 3
    assert page1["items"][0]["id"] == "rec-01"
    assert page1["items"][2]["id"] == "rec-03"
    assert page1["has_more"] is True
    assert page1["next_cursor"] is not None

    # Page 2
    page2 = paginate_with_cursor(dataset, cursor=page1["next_cursor"], limit=3, sort_key="id")
    assert len(page2["items"]) == 3
    assert page2["items"][0]["id"] == "rec-04"
    assert page2["items"][2]["id"] == "rec-06"
    assert page2["has_more"] is True

    # Page 3
    page3 = paginate_with_cursor(dataset, cursor=page2["next_cursor"], limit=3, sort_key="id")
    assert len(page3["items"]) == 3
    assert page3["items"][0]["id"] == "rec-07"
    assert page3["items"][2]["id"] == "rec-09"
    assert page3["has_more"] is True

    # Final Page
    page4 = paginate_with_cursor(dataset, cursor=page3["next_cursor"], limit=3, sort_key="id")
    assert len(page4["items"]) == 1
    assert page4["items"][0]["id"] == "rec-10"
    assert page4["has_more"] is False
    assert page4["next_cursor"] is None


def test_rate_limit_headers_and_retry_after():
    from services.login_security import (
        record_login_attempt,
        is_login_rate_limited,
        get_rate_limit_headers,
        reset_login_rate_limit,
    )

    user = "ratelimit_user"
    ip = "192.168.1.100"
    reset_login_rate_limit(user, ip)

    # 1. Under limit: remaining > 0, no Retry-After
    record_login_attempt(user, ip, success=False)
    headers = get_rate_limit_headers(user, ip, max_failures=3, window_seconds=60)
    assert headers["X-RateLimit-Limit"] == "3"
    assert headers["X-RateLimit-Remaining"] == "2"
    assert "Retry-After" not in headers

    # 2. Exceed limit: remaining == 0, Retry-After header present
    record_login_attempt(user, ip, success=False)
    record_login_attempt(user, ip, success=False)
    is_blocked, retry_after = is_login_rate_limited(user, ip, max_failures=3, window_seconds=60)
    assert is_blocked is True
    assert retry_after > 0

    headers_blocked = get_rate_limit_headers(user, ip, max_failures=3, window_seconds=60)
    assert headers_blocked["X-RateLimit-Limit"] == "3"
    assert headers_blocked["X-RateLimit-Remaining"] == "0"
    assert "Retry-After" in headers_blocked
    assert int(headers_blocked["Retry-After"]) >= 1


def test_configurable_timeout_policy(pg_db):
    from services.timeout_policy import (
        get_timeout_policy,
        set_timeout_policy,
        list_timeout_policies,
        delete_timeout_policy,
    )

    # 1. Default fallback when unconfigured
    assert get_timeout_policy("opentofu:apply", default_seconds=1800) == 1800

    # 2. Configure customized policy
    set_timeout_policy("opentofu:apply", 2400)
    set_timeout_policy("http_client:webhook", 10)

    assert get_timeout_policy("opentofu:apply") == 2400
    assert get_timeout_policy("http_client:webhook") == 10

    # 3. List policies
    policies = list_timeout_policies()
    assert policies.get("opentofu:apply") == 2400
    assert policies.get("http_client:webhook") == 10

    # 4. Delete policy reverts to default
    assert delete_timeout_policy("http_client:webhook") is True
    assert get_timeout_policy("http_client:webhook", default_seconds=30) == 30


def test_graceful_shutdown_and_run_draining():
    import threading
    import time
    from services.shutdown_drain import (
        register_in_flight_job,
        unregister_in_flight_job,
        is_draining,
        drain_and_shutdown,
        reset_drain_state,
    )

    reset_drain_state()
    assert is_draining() is False

    # 1. Register active jobs
    register_in_flight_job("job-101", {"stack": "k8s-prod"})
    register_in_flight_job("job-102", {"stack": "db-prod"})

    # 2. Start a background thread to complete job-101 and job-102 after short delay
    def _completer():
        time.sleep(0.05)
        unregister_in_flight_job("job-101")
        time.sleep(0.05)
        unregister_in_flight_job("job-102")

    t = threading.Thread(target=_completer)
    t.start()

    # 3. Drain and wait for in-flight tasks
    res = drain_and_shutdown(timeout_seconds=2.0, poll_interval=0.01)
    t.join()

    assert res["drained"] is True
    assert res["active_jobs_remaining"] == 0
    assert is_draining() is True




