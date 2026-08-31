"""Ontology schema validation (Phase 1 of the domain ontology plan)."""
from __future__ import annotations

import json
from pathlib import Path

# parents[3] = repo root (test lives at apps/server/tests/); the ontology is a
# repo-level contract artifact alongside contracts/radas-api-v2.openapi.json.
ONTOLOGY_PATH = Path(__file__).resolve().parents[3] / "contracts" / "domain-ontology.json"


def _load():
    return json.loads(ONTOLOGY_PATH.read_text(encoding="utf-8"))


def test_ontology_file_exists_and_is_valid_json():
    assert ONTOLOGY_PATH.is_file(), f"missing {ONTOLOGY_PATH}"


def test_ontology_has_required_top_level_keys():
    data = _load()
    assert data["ontology_version"] == 1
    assert isinstance(data["entities"], dict)
    assert isinstance(data["alerts"], dict)


def test_every_entity_has_states_and_relations():
    data = _load()
    for name, entity in data["entities"].items():
        assert "states" in entity, f"entity {name} missing states"
        assert "transitions" in entity, f"entity {name} missing transitions"
        assert "relations" in entity, f"entity {name} missing relations"
        assert "events" in entity, f"entity {name} missing events"
        # transitions keys must be a subset of states
        for from_state in entity["transitions"]:
            assert from_state in entity["states"], (
                f"entity {name}: transition source {from_state} not in states"
            )
            for to_state in entity["transitions"][from_state]:
                assert to_state in entity["states"], (
                    f"entity {name}: transition target {to_state} not in states"
                )


def test_relations_reference_declared_entities():
    data = _load()
    for name, entity in data["entities"].items():
        for rel, target in entity["relations"].items():
            assert target in data["entities"], (
                f"entity {name} relation {rel} points at undeclared entity {target}"
            )


def test_service_operation_states_match_planned_set():
    data = _load()
    op = data["entities"]["ServiceOperation"]
    assert set(op["states"]) == {"pending", "queued", "running", "succeeded", "failed", "canceled"}


def test_instance_states_match_planned_set():
    data = _load()
    inst = data["entities"]["ServiceInstance"]
    assert "draft" in inst["states"]
    assert "running" in inst["states"]
    assert "destroyed" in inst["states"]


def test_alert_rules_have_required_fields():
    data = _load()
    assert len(data["alerts"]) >= 5, "ontology must ship at least five alert rules"
    for rule_id, rule in data["alerts"].items():
        assert rule["when"], f"alert {rule_id} missing when"
        assert rule["severity"] in ("critical", "warning", "info"), f"alert {rule_id} bad severity"
        assert rule["route"].startswith("/"), f"alert {rule_id} route must be absolute"
        assert rule["title"], f"alert {rule_id} missing title"


def test_alert_when_uses_only_supported_syntax():
    import re
    data = _load()
    # The expression subset is field paths, comparison operators (==, !=, >,
    # >=, <, <=), integer/float literals, double-quoted string literals, and &&.
    # String literals are part of the DSL the pet evaluator implements
    # (apps/desktop-app/ontology/evaluate.js tokenizer accepts "[^"]*"), so the
    # schema gate must accept them too.
    token_re = re.compile(
        r"[A-Za-z_][A-Za-z0-9_.]*|\"[^\"]*\"|==|!=|>=|<=|>|<|&&|\d+(?:\.\d+)?"
    )
    for rule_id, rule in data["alerts"].items():
        expr = rule["when"]
        remainder = token_re.sub("", expr).replace(" ", "")
        assert remainder == "", (
            f"alert {rule_id} uses unsupported syntax: {remainder!r} in {expr!r}"
        )
