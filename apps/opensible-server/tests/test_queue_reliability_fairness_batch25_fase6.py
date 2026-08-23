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
