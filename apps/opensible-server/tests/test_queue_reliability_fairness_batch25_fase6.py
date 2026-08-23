import pytest


def test_bulk_stack_orchestrator(pg_db):
    from services.bulk_stack_runner import execute_bulk_stack_action

    stacks = ["vpc-network", "auth-service", "frontend-app"]

    res = execute_bulk_stack_action(
        project_id="p-bulk-ops",
        stack_names=stacks,
        action="apply",
        actor="dev-lead",
    )
    assert res["success"] is True
    assert res["action"] == "apply"
    assert res["count"] == 3
    assert "vpc-network" in res["dispatched_stacks"]


def test_semantic_not_found_handler():
    from utils.not_found_handler import format_not_found_response

    res = format_not_found_response(
        entity_type="feature_flag",
        entity_id="flag-beta-v3",
        context="project: p-global",
    )
    assert res["error"] == "not_found"
    assert res["status_code"] == 404
    assert res["entity_type"] == "feature_flag"
    assert "Feature_flag 'flag-beta-v3' was not found" in res["message"]
    assert "project: p-global" in res["message"]


def test_standard_error_envelope():
    from utils.error_envelope import make_error_envelope

    env = make_error_envelope(
        error_code="invalid_payload",
        message="Missing required field 'region'",
        status_code=422,
        details={"field": "region", "received": None},
    )
    assert env["error"] == "invalid_payload"
    assert env["status_code"] == 422
    assert env["details"]["field"] == "region"
    assert "timestamp" in env


def test_structured_json_logger():
    import json
    from utils.structured_json_logger import format_structured_log

    log_line = format_structured_log(
        event_type="security.auth.failed",
        message="Invalid password attempt for user admin",
        level="WARN",
        context={"user": "admin", "ip": "192.168.1.50"},
    )
    parsed = json.loads(log_line)
    assert parsed["level"] == "WARN"
    assert parsed["event_type"] == "security.auth.failed"
    assert parsed["context"]["ip"] == "192.168.1.50"


def test_worker_queue_recovery(pg_db):
    from services.worker_recovery import recover_interrupted_queue
    from storage import pg

    # 1. Seed an interrupted execution in running_executions
    pg.execute(
        "INSERT INTO running_executions (execution_id, project_id, worker_id, started_at) "
        "VALUES (%s, %s, %s, %s)",
        ("exec-interrupted-01", "p-recovery", "worker-node-1", 1700000000.0),
    )

    # 2. Trigger queue recovery
    res = recover_interrupted_queue(project_id="p-recovery")
    assert res["recovered_count"] >= 1
    assert "exec-interrupted-01" in res["recovered_run_ids"]

    # 3. Check execution is now queued in queued_executions and location is 'queued'
    queued_row = pg.query_one("SELECT execution_id FROM queued_executions WHERE execution_id = %s", ("exec-interrupted-01",))
    assert queued_row is not None

    loc_row = pg.query_one("SELECT status FROM execution_locations WHERE execution_id = %s", ("exec-interrupted-01",))
    assert loc_row["status"] == "queued"



def test_execution_claim_backoff():
    from services.claim_backoff import calculate_claim_backoff

    # Attempt 1: 0.5s
    assert calculate_claim_backoff(attempt=1, base_delay=0.5, max_delay=10.0) == 0.5
    # Attempt 2: 1.0s
    assert calculate_claim_backoff(attempt=2, base_delay=0.5, max_delay=10.0) == 1.0
    # Attempt 3: 2.0s
    assert calculate_claim_backoff(attempt=3, base_delay=0.5, max_delay=10.0) == 2.0
    # Attempt 10: Capped at max_delay (10.0s)
    assert calculate_claim_backoff(attempt=10, base_delay=0.5, max_delay=10.0) == 10.0


