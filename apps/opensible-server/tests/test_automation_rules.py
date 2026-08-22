"""Tests for Automation Rules and Feature Flag Gates (UC119 / UC127).

Verifies auto-scale, auto-stop, remediation execution, and feature flag gating.
"""
from __future__ import annotations

from datetime import datetime
import pytest

from services import automation_rules
from services import feature_flags


def test_seed_default_flags():
    """UC119: Enumerasi flag untuk seed default (block_apply, block_destroy, preview, auto_scale)."""
    assert feature_flags.DEFAULT_FLAGS == ("block_apply", "block_destroy", "preview", "auto_scale")
    created = feature_flags.seed_default_flags()
    assert created >= 0
    for flag_name in feature_flags.DEFAULT_FLAGS:
        flag = feature_flags.get_flag(flag_name)
        assert flag is not None
        assert flag["key"] == flag_name


def test_automation_rules_gated_by_feature_flags(monkeypatch):
    """UC127: Flag digunakan oleh automation_rules (gate auto-scale/auto-stop)."""
    # 1. Mock datetime
    fixed_now = datetime(2026, 8, 22, 2, 0, 0)  # hour=2, Saturday (weekday=5)
    class MockDatetime:
        @classmethod
        def now(cls):
            return fixed_now

    monkeypatch.setattr("services.automation_rules.datetime", MockDatetime)
    monkeypatch.setattr("services.automation_rules.in_maintenance", lambda pid: False)

    # 2. Mock rules
    rules = [
        {"id": "r1", "kind": "auto_stop", "project_id": "p1", "stack": "s1", "hour": 2, "days": [5], "enabled": True},
        {"id": "r2", "kind": "auto_scale", "project_id": "p1", "stack": "s2", "hour": 2, "days": [5], "scale_to": 3, "enabled": True},
    ]
    monkeypatch.setattr("services.automation_rules.load", lambda: rules)

    queued_actions = []
    def mock_queue(pid, stack, action, why):
        queued_actions.append({"pid": pid, "stack": stack, "action": action, "why": why})
        return True

    monkeypatch.setattr("services.automation_rules._queue", mock_queue)

    # Case A: Flags enabled -> actions run
    flag_states = {"auto_stop": True, "block_destroy": False, "auto_scale": True}
    def mock_evaluate(key, **kwargs):
        return {"enabled": flag_states.get(key, True)}

    monkeypatch.setattr("services.feature_flags.evaluate", mock_evaluate)

    res = automation_rules.run_rules_once()
    assert res["auto_stop"] == 1
    assert len(queued_actions) == 1
    assert queued_actions[0]["why"] == "auto_stop"

    # Case B: block_destroy enabled -> auto_stop blocked
    queued_actions.clear()
    flag_states["block_destroy"] = True
    res = automation_rules.run_rules_once()
    assert res["auto_stop"] == 0
    assert len(queued_actions) == 0

    # Case C: auto_stop disabled -> auto_stop blocked
    flag_states["block_destroy"] = False
    flag_states["auto_stop"] = False
    res = automation_rules.run_rules_once()
    assert res["auto_stop"] == 0
    assert len(queued_actions) == 0


def test_remediation_gated_by_feature_flags(monkeypatch):
    """UC134: Remediation Rule Feature Flag Gating (remediate only if flag)."""
    monkeypatch.setattr("services.automation_rules.in_maintenance", lambda pid: False)

    rules = [
        {"id": "r3", "kind": "remediate", "project_id": "p1", "stack": "prod-stack", "enabled": True},
    ]
    monkeypatch.setattr("services.automation_rules.load", lambda: rules)
    monkeypatch.setattr("services.cloud_provisioning._latest_drift_run", lambda pid, stack: {"returnCode": 2})

    queued_actions = []
    def mock_queue(pid, stack, action, why):
        queued_actions.append({"pid": pid, "stack": stack, "action": action, "why": why})
        return True

    monkeypatch.setattr("services.automation_rules._queue", mock_queue)

    flag_evals = {}
    def mock_evaluate(key, **kwargs):
        return {"enabled": flag_evals.get(key, True)}

    monkeypatch.setattr("services.feature_flags.evaluate", mock_evaluate)

    # 1. Default/all flags enabled -> remediate queues action
    flag_evals = {"remediation.enabled": True, "remediation.prod-stack.enabled": True, "auto_remediate": True}
    res = automation_rules.run_rules_once()
    assert res["remediate"] == 1
    assert len(queued_actions) == 1
    assert queued_actions[0]["why"] == "remediate"

    # 2. auto_remediate = False -> remediation skipped
    queued_actions.clear()
    flag_evals = {"auto_remediate": False}
    res = automation_rules.run_rules_once()
    assert res["remediate"] == 0
    assert len(queued_actions) == 0

    # 3. remediation.enabled = False -> remediation skipped
    queued_actions.clear()
    flag_evals = {"remediation.enabled": False, "auto_remediate": True}
    res = automation_rules.run_rules_once()
    assert res["remediate"] == 0
    assert len(queued_actions) == 0

    # 4. remediation.<stack>.enabled = False -> remediation skipped
    queued_actions.clear()
    flag_evals = {"remediation.enabled": True, "remediation.prod-stack.enabled": False, "auto_remediate": True}
    res = automation_rules.run_rules_once()
    assert res["remediate"] == 0
    assert len(queued_actions) == 0

