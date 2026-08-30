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
