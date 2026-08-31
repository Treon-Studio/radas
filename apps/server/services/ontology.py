"""Domain ontology loader (Phase 2 of the domain ontology plan).

Reads contracts/domain-ontology.json — the platform's semantic contract for
entity states, transitions, relations, events, and alert rules — and exposes
typed accessors. The ontology is descriptive: it records the state machines
as they exist in server code; the parity gate (test_ontology_parity.py)
fails when either side drifts.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict, List

_LOCK = threading.Lock()
_CACHE: Dict[str, Any] = {}


def _ontology_path() -> Path:
    # apps/server/services/ontology.py -> services -> server -> apps -> repo root
    return Path(__file__).resolve().parents[3] / "contracts" / "domain-ontology.json"


def load_ontology() -> Dict[str, Any]:
    """Load (and cache) the domain ontology."""
    if "ontology" in _CACHE:
        return _CACHE["ontology"]
    with _LOCK:
        if "ontology" in _CACHE:
            return _CACHE["ontology"]
        _CACHE["ontology"] = json.loads(_ontology_path().read_text(encoding="utf-8"))
        return _CACHE["ontology"]


def entity(name: str) -> Dict[str, Any]:
    try:
        return load_ontology()["entities"][name]
    except KeyError:
        raise KeyError(f"unknown ontology entity: {name}") from None


def states(name: str) -> List[str]:
    return list(entity(name)["states"])


def transitions(name: str) -> Dict[str, List[str]]:
    return {k: list(v) for k, v in entity(name)["transitions"].items()}


def alert_rules() -> Dict[str, Dict[str, Any]]:
    return dict(load_ontology()["alerts"])
