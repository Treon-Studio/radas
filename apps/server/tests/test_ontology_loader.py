"""Ontology loader tests."""
from __future__ import annotations


def test_load_ontology_returns_cached_dict():
    from services import ontology
    first = ontology.load_ontology()
    second = ontology.load_ontology()
    assert first is second  # cached
    assert first["ontology_version"] == 1


def test_entity_states_for_execution():
    from services import ontology
    states = ontology.states("Execution")
    assert "QUEUED" in states and "SUCCESS" in states


def test_transitions_for_service_operation():
    from services import ontology
    t = ontology.transitions("ServiceOperation")
    assert set(t["queued"]) == {"queued", "running", "failed", "canceled"}


def test_alert_rules_include_workers_and_approvals():
    from services import ontology
    rules = ontology.alert_rules()
    assert "workers.all_offline" in rules
    assert "approvals.pending" in rules


def test_unknown_entity_raises():
    import pytest
    from services import ontology
    with pytest.raises(KeyError):
        ontology.entity("DoesNotExist")
