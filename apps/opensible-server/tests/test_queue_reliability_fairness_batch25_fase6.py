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

