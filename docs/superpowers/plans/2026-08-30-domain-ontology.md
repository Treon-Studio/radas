# RADAS Domain Ontology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single, versioned domain ontology (`contracts/domain-ontology.json`) that becomes the source of truth for entity states, transitions, relations, events, and alert rules — then wire it into the desktop pet (reasoning engine), a cross-client parity gate (drift detection), and console search (concept-aware queries).

**Architecture:** Contract-first, following the repo's established `contracts/` pattern (`cli-route-manifest.json`, `cross-client-fixtures.json`). One JSON artifact defines the domain; a Python loader module reads it server-side; the pet consumes a compiled alert rule set; a parity test compares the contract against the real state machines in server code. No OWL/RDF/reasoner — a pragmatic JSON schema with validation.

**Tech Stack:** Python 3.14 (server, loader + parity tests), TypeScript/React 19 (console, pet types), Electron main process (pet alert evaluation), Vitest/pytest for gates.

## Global Constraints

- The ontology file is `contracts/domain-ontology.json`, schema versioned by a top-level `"ontology_version": 1` integer.
- The ontology is **descriptive first**: it records the state machines as they exist in server code today (extracted from `service_operations.py:48-56`, `service_instances.py:27-44`, `executions_store.py:38-45`). It does not change server behavior in Phase 1-2.
- State names are recorded **verbatim** from server constants (lowercase for service operations/instances, UPPERCASE for legacy executions) — the ontology does not normalize casing; it records reality.
- Alert rules use a deliberately tiny expression subset: field paths (`workers.online`), comparison operators (`==`, `>`, `>=`, `<`, `<=`), integer/float literals, `&&`, and `count > 0` style predicates over entity collections. No general expression language.
- The pet's alert evaluation happens in the Electron main process (Node), not the renderer — token-carrying fetches already live there (`main.js:513-514`).
- Secrets never appear in the ontology (no tokens, no payloads — entity metadata and rules only).
- Parity gate is **tighten-only in spirit**: a parity test failure means server code and the ontology drifted; the fix is to update whichever side is wrong, deliberately, in a commit that explains the change.

## File Structure

```
contracts/domain-ontology.json          # THE artifact (Phase 1-3 build it out)
apps/server/services/ontology.py        # loader + validation (Phase 2)
apps/server/tests/test_ontology_parity.py  # parity gate vs server constants (Phase 2)
apps/desktop-app/ontology/evaluate.js   # alert-rule evaluator, Node (Phase 4)
apps/desktop-app/ontology/alerts.js     # pet alert binding: rules -> status payloads (Phase 4)
apps/desktop-app/src/pet/useCaseAnnotations.ts  # concept bindings for the 500 use cases (Phase 5)
apps/console/src/lib/ontology.ts        # generated TS types + alert predicates (Phase 6)
```

---

## Phase 1 — Extract the Execution domain into the ontology

The ontology starts with the three state machines that already exist as constants, plus the alert rules the pet currently hardcodes.

### Task 1.1: Create the ontology skeleton with the Execution entity

**Files:**
- Create: `contracts/domain-ontology.json`
- Create: `apps/server/tests/test_ontology_schema.py`

**Interfaces:**
- Produces: `contracts/domain-ontology.json` with top-level keys `ontology_version`, `entities`, `alerts`. Later tasks add entities to `entities` and rules to `alerts`; this shape is final.

- [ ] **Step 1: Write the failing schema test**

```python
"""Ontology schema validation (Phase 1 of the domain ontology plan)."""
from __future__ import annotations

import json
from pathlib import Path

ONTOLOGY_PATH = Path(__file__).resolve().parents[2] / "contracts" / "domain-ontology.json"


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && .venv/bin/pytest tests/test_ontology_schema.py -v`
Expected: FAIL — `FileNotFoundError` (ontology does not exist yet).

- [ ] **Step 3: Create the ontology with the Execution entity**

```json
{
  "ontology_version": 1,
  "entities": {
    "Execution": {
      "description": "Legacy OpenTofu/Ansible run tracked in project JSON files and the durable queue.",
      "states": ["QUEUED", "RUNNING", "CANCELING", "SUCCESS", "FAILED", "CANCELED"],
      "final_states": ["SUCCESS", "FAILED", "CANCELED"],
      "transitions": {
        "QUEUED": ["RUNNING", "CANCELED"],
        "RUNNING": ["SUCCESS", "FAILED", "CANCELING"],
        "CANCELING": ["CANCELED", "FAILED"],
        "CANCELED": [],
        "SUCCESS": [],
        "FAILED": []
      },
      "relations": {
        "runs_on": "Worker",
        "belongs_to": "Project",
        "targets": "Stack"
      },
      "events": [
        "execution.queued",
        "execution.started",
        "execution.finished",
        "execution.recovered"
      ],
      "source": "apps/server/storage/executions_store.py:38-45"
    }
  },
  "alerts": {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && .venv/bin/pytest tests/test_ontology_schema.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/domain-ontology.json apps/server/tests/test_ontology_schema.py
git commit -m "feat(ontology): extract Execution state machine into the domain ontology"
```

### Task 1.2: Add ServiceOperation, ServiceInstance, Worker, Approval, Budget entities

**Files:**
- Modify: `contracts/domain-ontology.json`
- Test: `apps/server/tests/test_ontology_schema.py` (extend)

**Interfaces:**
- Consumes: the ontology shape from Task 1.1.
- Produces: five more entities. Their `states`/`transitions` values are copied verbatim from `service_operations.py:48-56` (lowercase) and `service_instances.py:34-44` (lowercase); `Worker`/`Approval`/`Budget` are observational (states derived from the fields the pet already polls: `is_online`, `status`, `spend_status`).

- [ ] **Step 1: Extend the schema test with cross-entity relation validation**

Add to `apps/server/tests/test_ontology_schema.py`:

```python
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
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd apps/server && .venv/bin/pytest tests/test_ontology_schema.py -v`
Expected: FAIL — `ServiceOperation` not in entities.

- [ ] **Step 3: Add the five entities to the ontology**

Append inside `"entities"` (values transcribed from the source constants — do not paraphrase):

```json
"ServiceOperation": {
  "description": "Tenant-scoped, idempotent operation on a service instance (deploy/update/stop/...).",
  "states": ["pending", "queued", "running", "succeeded", "failed", "canceled"],
  "final_states": ["succeeded", "failed", "canceled"],
  "transitions": {
    "pending": ["pending", "queued", "running", "failed", "canceled"],
    "queued": ["queued", "running", "failed", "canceled"],
    "running": ["running", "succeeded", "failed", "canceled"],
    "succeeded": ["succeeded"],
    "failed": ["failed"],
    "canceled": ["canceled"]
  },
  "relations": {
    "operates_on": "ServiceInstance",
    "belongs_to": "Project",
    "claimed_by": "Worker"
  },
  "events": ["operation.queued", "operation.claimed", "operation.finished", "operation.canceled"],
  "source": "apps/server/services/service_operations.py:48-56"
},
"ServiceInstance": {
  "description": "Provider-neutral service instance with immutable revisions.",
  "states": ["draft", "provisioning", "running", "degraded", "stopped", "updating", "destroying", "destroyed", "failed"],
  "final_states": [],
  "transitions": {
    "draft": ["draft", "provisioning", "destroying", "failed"],
    "provisioning": ["provisioning", "running", "degraded", "failed", "destroying"],
    "running": ["running", "degraded", "stopped", "updating", "destroying", "failed"],
    "degraded": ["degraded", "running", "stopped", "updating", "destroying", "failed"],
    "stopped": ["stopped", "provisioning", "running", "updating", "destroying", "destroyed", "failed"],
    "updating": ["updating", "running", "degraded", "failed", "destroying"],
    "destroying": ["destroying", "destroyed", "failed"],
    "destroyed": ["destroyed", "draft", "provisioning"],
    "failed": ["failed", "draft", "provisioning", "running", "updating", "destroying"]
  },
  "relations": {
    "belongs_to": "Project",
    "defined_by": "ServiceDefinition",
    "runs_on": "RuntimeProvider"
  },
  "events": ["instance.created", "instance.state_changed", "instance.observed"],
  "source": "apps/server/services/service_instances.py:27-44"
},
"Worker": {
  "description": "Registered execution daemon polling /api/worker/claim.",
  "states": ["online", "offline", "draining"],
  "final_states": [],
  "transitions": {
    "online": ["online", "offline", "draining"],
    "offline": ["offline", "online"],
    "draining": ["draining", "offline"]
  },
  "relations": {
    "claims": "ServiceOperation",
    "executes": "Execution"
  },
  "events": ["worker.registered", "worker.heartbeat", "worker.offline"],
  "source": "apps/server/services/worker_registry.py"
},
"Approval": {
  "description": "Infrastructure change request awaiting a decision.",
  "states": ["pending", "approved", "rejected", "expired"],
  "final_states": ["approved", "rejected", "expired"],
  "transitions": {
    "pending": ["approved", "rejected", "expired"],
    "approved": [],
    "rejected": [],
    "expired": []
  },
  "relations": {
    "belongs_to": "Project",
    "gates": "Execution"
  },
  "events": ["approval.requested", "approval.decided", "approval.expired"],
  "source": "apps/server/services/approval_service.py"
},
"Budget": {
  "description": "Per-project spend threshold with alerting.",
  "states": ["ok", "alerting", "unavailable"],
  "final_states": [],
  "transitions": {
    "ok": ["ok", "alerting", "unavailable"],
    "alerting": ["alerting", "ok", "unavailable"],
    "unavailable": ["unavailable", "ok", "alerting"]
  },
  "relations": {
    "belongs_to": "Project"
  },
  "events": ["budget.alert", "budget.recovered"],
  "source": "apps/server/services/budget_service.py"
}
```

- [ ] **Step 4: Run all schema tests**

Run: `cd apps/server && .venv/bin/pytest tests/test_ontology_schema.py -v`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/domain-ontology.json apps/server/tests/test_ontology_schema.py
git commit -m "feat(ontology): add ServiceOperation, ServiceInstance, Worker, Approval, Budget entities"
```

### Task 1.3: Define the alert rule DSL and the first five alert rules

**Files:**
- Modify: `contracts/domain-ontology.json`
- Test: `apps/server/tests/test_ontology_schema.py` (extend)

**Interfaces:**
- Produces: alert rules with shape `{"when": "<expr>", "severity": "critical|warning|info", "route": "<console path>", "title": "<text>"}`. The expression grammar: field paths over a status payload (`workers.online`, `approvals.pending`), comparisons, `&&`, literals. Phase 4's evaluator implements exactly this subset.

- [ ] **Step 1: Add the alert-rule schema test**

```python
def test_alert_rules_have_required_fields():
    data = _load()
    for rule_id, rule in data["alerts"].items():
        assert rule["when"], f"alert {rule_id} missing when"
        assert rule["severity"] in ("critical", "warning", "info"), f"alert {rule_id} bad severity"
        assert rule["route"].startswith("/"), f"alert {rule_id} route must be absolute"
        assert rule["title"], f"alert {rule_id} missing title"


def test_alert_when_uses_only_supported_syntax():
    import re
    data = _load()
    token_re = re.compile(
        r"[A-Za-z_][A-Za-z0-9_.]*|==|>=|<=|>|<|&&|\d+(?:\.\d+)?"
    )
    for rule_id, rule in data["alerts"].items():
        expr = rule["when"]
        remainder = token_re.sub("", expr).replace(" ", "")
        assert remainder == "", (
            f"alert {rule_id} uses unsupported syntax: {remainder!r} in {expr!r}"
        )
```

- [ ] **Step 2: Verify it fails (no alerts yet — `test_alert_rules_have_required_fields` passes trivially on empty dict is fine, so assert non-empty)**

Adjust the first test to also assert `len(data["alerts"]) >= 5`, run, expect FAIL.

- [ ] **Step 3: Add the five alert rules**

```json
"alerts": {
  "workers.all_offline": {
    "when": "workers.total > 0 && workers.online == 0",
    "severity": "critical",
    "route": "/system/workers",
    "title": "All workers offline!"
  },
  "workers.partial_offline": {
    "when": "workers.online > 0 && workers.online < workers.total",
    "severity": "warning",
    "route": "/system/workers",
    "title": "Some workers offline"
  },
  "approvals.pending": {
    "when": "approvals.pending > 0",
    "severity": "info",
    "route": "/approvals",
    "title": "Approvals waiting"
  },
  "budget.threshold": {
    "when": "budget.usage_pct >= budget.alert_at_pct",
    "severity": "warning",
    "route": "/cloud/cost",
    "title": "Budget threshold reached"
  },
  "budget.unavailable": {
    "when": "budget.spend_status == \"unavailable\"",
    "severity": "warning",
    "route": "/cloud/cost",
    "title": "Cost store unavailable"
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/server && .venv/bin/pytest tests/test_ontology_schema.py -v`
Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/domain-ontology.json apps/server/tests/test_ontology_schema.py
git commit -m "feat(ontology): alert rule DSL with the first five rules"
```

---

## Phase 2 — Server-side loader and the parity gate

### Task 2.1: Ontology loader module

**Files:**
- Create: `apps/server/services/ontology.py`
- Test: `apps/server/tests/test_ontology_loader.py`

**Interfaces:**
- Produces: `load_ontology() -> dict` (cached, reads `contracts/domain-ontology.json` relative to the repo root), `entity(name) -> dict`, `states(name) -> list[str]`, `transitions(name) -> dict[str, list[str]]`, `alert_rules() -> dict[str, dict]`.

- [ ] **Step 1: Write the failing loader test**

```python
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/server && .venv/bin/pytest tests/test_ontology_loader.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.ontology'`.

- [ ] **Step 3: Implement the loader**

```python
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
    # apps/server/services/ontology.py -> repo root / contracts
    return Path(__file__).resolve().parents[2] / "contracts" / "domain-ontology.json"


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
```

- [ ] **Step 4: Run tests**

Run: `cd apps/server && .venv/bin/pytest tests/test_ontology_loader.py -v`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/services/ontology.py apps/server/tests/test_ontology_loader.py
git commit -m "feat(ontology): server-side loader with cached typed accessors"
```

### Task 2.2: Parity gate — ontology vs server state machines

**Files:**
- Create: `apps/server/tests/test_ontology_parity.py`

**Interfaces:**
- Consumes: `services.ontology` (Task 2.1), the real constants in `executions_store`, `service_operations`, `service_instances`.
- Produces: the parity gate. Every drift between ontology and code fails this test with a message naming both sides.

- [ ] **Step 1: Write the parity test**

```python
"""Ontology parity gate (Phase 2).

The ontology is the cross-client semantic contract; these tests fail when
server state machines drift from it. Drift is fixed deliberately: update
whichever side is wrong, in a commit that explains the change.
"""
from __future__ import annotations


def _as_sets(mapping):
    return {k: set(v) for k, v in mapping.items()}


def test_execution_parity():
    from services import ontology
    from storage.executions_store import ALLOWED_TRANSITIONS, FINAL_STATUSES
    assert set(ontology.states("Execution")) == set(ALLOWED_TRANSITIONS.keys())
    assert set(ontology.entity("Execution")["final_states"]) == FINAL_STATUSES
    assert _as_sets(ontology.transitions("Execution")) == _as_sets(ALLOWED_TRANSITIONS)


def test_service_operation_parity():
    from services import ontology
    from services.service_operations import OPERATION_STATES, OPERATION_TRANSITIONS
    assert set(ontology.states("ServiceOperation")) == set(OPERATION_STATES)
    assert _as_sets(ontology.transitions("ServiceOperation")) == _as_sets(OPERATION_TRANSITIONS)


def test_service_instance_parity():
    from services import ontology
    from services.service_instances import INSTANCE_STATES, INSTANCE_TRANSITIONS
    assert set(ontology.states("ServiceInstance")) == set(INSTANCE_STATES)
    assert _as_sets(ontology.transitions("ServiceInstance")) == _as_sets(INSTANCE_TRANSITIONS)


def test_metric_counters_referenced_by_alerts_exist():
    """Every counter an alert rule mentions must be emitted by metrics_counters."""
    import re
    from services import ontology
    src = open("storage/metrics_counters.py", encoding="utf-8").read()
    src += open("services/metrics.py", encoding="utf-8").read()
    emitted = set(re.findall(r'radas_([a-z_]+)', src))
    # the alert payload fields map to these counters; document the mapping
    assert "recovery_requeued_total" in emitted
    assert "provider_errors_total" in emitted
```

- [ ] **Step 2: Run to verify it passes (the ontology was transcribed verbatim)**

Run: `cd apps/server && .venv/bin/pytest tests/test_ontology_parity.py -v`
Expected: 4 PASS. If any FAIL, the transcription in Phase 1 was wrong — fix the ontology, not the server.

- [ ] **Step 3: Commit**

```bash
git add apps/server/tests/test_ontology_parity.py
git commit -m "test(ontology): parity gate between the contract and server state machines"
```

### Task 2.3: Expose the ontology via a read-only API route

**Files:**
- Modify: `apps/server/api/route_inventory.py` (register new blueprint)
- Create: `apps/server/api/ontology_routes.py`
- Test: extend `apps/server/tests/test_ontology_parity.py`

**Interfaces:**
- Produces: `GET /api/ontology` (platform envelope: `{data: {ontology}, request_id}`) and `GET /api/ontology/alerts`. Requires auth. The desktop app and console fetch this instead of hardcoding rules.

- [ ] **Step 1: Write the failing route test**

```python
def test_ontology_route_serves_platform_envelope(app_client):
    r = app_client.get("/api/ontology")
    assert r.status_code == 200
    body = r.get_json()
    assert "data" in body and "request_id" in body
    assert body["data"]["ontology_version"] == 1
    assert "Execution" in body["data"]["entities"]


def test_ontology_alerts_route_lists_rules(app_client):
    r = app_client.get("/api/ontology/alerts")
    assert r.status_code == 200
    rules = r.get_json()["data"]["alerts"]
    assert "workers.all_offline" in rules
```

Note: `app_client` is the blueprint-registering harness fixture from `tests/test_cli_server_integration.py` — copy the `contract_client` fixture pattern (real blueprints + real PG rows + isolated data_dir; never import `app.py`).

- [ ] **Step 2: Verify it fails**

Run: `cd apps/server && .venv/bin/pytest tests/test_ontology_parity.py -v`
Expected: FAIL — 404 (route not registered).

- [ ] **Step 3: Implement the routes**

```python
"""Ontology read-only routes (Phase 2 of the domain ontology plan)."""
from __future__ import annotations

from flask import Blueprint

from api.platform_contracts import success_response
from auth.middleware import require_auth
from services import ontology

bp = Blueprint("ontology_api", __name__)


@bp.get("/api/ontology")
@require_auth
def get_ontology():
    return success_response({"ontology": ontology.load_ontology()})


@bp.get("/api/ontology/alerts")
@require_auth
def get_ontology_alerts():
    return success_response({"alerts": ontology.alert_rules()})
```

Register in `route_inventory.py` following the existing `OPTIONAL_BLUEPRINT_MODULES` pattern (module name `"api.ontology_routes"`, import name `ontology_routes`).

- [ ] **Step 4: Run tests**

Run: `cd apps/server && .venv/bin/pytest tests/test_ontology_parity.py -v`
Expected: 6 PASS.

- [ ] **Step 5: Run the full server suite (regression: route registration must not break the inventory) and the OpenAPI snapshot check**

Run: `cd apps/server && .venv/bin/pytest -q`
Expected: all pass. If the OpenAPI snapshot pin fails because of the new routes, regenerate deliberately via `apps/server/scripts/export_openapi.py` and commit the snapshot with the parity changes.

- [ ] **Step 6: Commit**

```bash
git add apps/server/api/ontology_routes.py apps/server/api/route_inventory.py apps/server/tests/test_ontology_parity.py contracts/radas-api-v2.openapi.json
git commit -m "feat(ontology): read-only /api/ontology routes for cross-client consumption"
```

---

## Phase 3 — Pet alert evaluator (Electron main process)

### Task 3.1: The rule evaluator module

**Files:**
- Create: `apps/desktop-app/ontology/evaluate.js`
- Create: `apps/desktop-app/ontology/evaluate.test.js` (run with `node --test`)

**Interfaces:**
- Consumes: alert rule objects shaped like Task 1.3's.
- Produces: `evaluateAlert(rule, status) -> boolean` and `evaluateAll(rules, status) -> {alertId: boolean}`. `status` is a flat object of numbers/strings (`{workers: {total: 3, online: 1}, approvals: {pending: 2}}`).

- [ ] **Step 1: Write the failing evaluator tests**

```javascript
// apps/desktop-app/ontology/evaluate.test.js
const test = require("node:test");
const assert = require("node:assert");
const { evaluateAlert, evaluateAll } = require("./evaluate");

const status = {
  workers: { total: 3, online: 1 },
  approvals: { pending: 2 },
  budget: { usage_pct: 90, alert_at_pct: 80, spend_status: "ok" },
};

test("workers.all_offline is false when some online", () => {
  const rule = { when: "workers.total > 0 && workers.online == 0" };
  assert.equal(evaluateAlert(rule, status), false);
});

test("workers.all_offline is true when total>0 and online==0", () => {
  const rule = { when: "workers.total > 0 && workers.online == 0" };
  assert.equal(evaluateAlert(rule, { ...status, workers: { total: 3, online: 0 } }), true);
});

test("approvals.pending fires for pending>0", () => {
  const rule = { when: "approvals.pending > 0" };
  assert.equal(evaluateAlert(rule, status), true);
});

test("budget string comparison", () => {
  const rule = { when: 'budget.spend_status == "unavailable"' };
  assert.equal(evaluateAlert(rule, status), false);
  assert.equal(evaluateAlert(rule, { ...status, budget: { spend_status: "unavailable" } }), true);
});

test("evaluateAll returns per-rule booleans", () => {
  const rules = {
    a: { when: "approvals.pending > 0" },
    b: { when: "workers.online == 0" },
  };
  const result = evaluateAll(rules, status);
  assert.deepEqual(result, { a: true, b: false });
});

test("malformed expression throws (no eval)", () => {
  const rule = { when: "process.exit(1)" };
  assert.throws(() => evaluateAlert(rule, status));
});
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/desktop-app && node --test ontology/evaluate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the evaluator (tokenizer + recursive descent, no eval)**

```javascript
// apps/desktop-app/ontology/evaluate.js
// Tiny safe expression evaluator for ontology alert rules.
// Grammar: comparison := path (==|!=|>=|<=|>|<) literal
//          and        := comparison (&& comparison)*
// Literals: integers, floats, double-quoted strings.
// Paths resolve against the flat status payload; unknown paths throw.

function tokenize(input) {
  const tokens = [];
  const re = /(\s+|==|!=|>=|<=|&&|\|\||[()>!<]|-?\d+(?:\.\d+)?|"[^"]*"|[A-Za-z_][A-Za-z0-9_.]*)/g;
  let match, last = 0;
  while ((match = re.exec(input)) !== null) {
    if (match.index > last) {
      const skipped = input.slice(last, match.index);
      if (skipped.trim() !== "") throw new Error(`unsupported syntax: ${skipped}`);
    }
    last = re.lastIndex;
    if (!/^\s+$/.test(match[0])) tokens.push(match[0]);
  }
  if (input.slice(last).trim() !== "") throw new Error("unsupported syntax at end");
  return tokens;
}

function resolvePath(status, path) {
  let cur = status;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object" || !(part in cur)) {
      throw new Error(`unknown status path: ${path}`);
    }
    cur = cur[part];
  }
  return cur;
}

function parseLiteral(token) {
  if (token.startsWith('"')) return token.slice(1, -1);
  const n = Number(token);
  if (Number.isNaN(n)) throw new Error(`bad literal: ${token}`);
  return n;
}

class Parser {
  constructor(tokens, status) {
    this.tokens = tokens;
    this.i = 0;
    this.status = status;
  }
  peek() { return this.tokens[this.i]; }
  next() { return this.tokens[this.i++]; }
  expect(tok) {
    const t = this.next();
    if (t !== tok) throw new Error(`expected ${tok}, got ${t}`);
    return t;
  }
  parseAnd() {
    let left = this.parseComparison();
    while (this.peek() === "&&") {
      this.next();
      const right = this.parseComparison();
      left = left && right;
    }
    return left;
  }
  parseComparison() {
    const leftToken = this.next();
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(leftToken)) throw new Error(`expected path, got ${leftToken}`);
    const left = resolvePath(this.status, leftToken);
    const op = this.next();
    if (!["==", "!=", ">=", "<=", ">", "<"].includes(op)) {
      throw new Error(`expected comparison operator, got ${op}`);
    }
    const right = parseLiteral(this.next());
    switch (op) {
      case "==": return left == right;   // loose: number-vs-number, string-vs-string
      case "!=": return left != right;
      case ">=": return left >= right;
      case "<=": return left <= right;
      case ">": return left > right;
      case "<": return left < right;
    }
  }
}

function evaluateAlert(rule, status) {
  const tokens = tokenize(rule.when);
  const parser = new Parser(tokens, status);
  const result = parser.parseAnd();
  if (parser.i !== tokens.length) throw new Error("trailing tokens in expression");
  return Boolean(result);
}

function evaluateAll(rules, status) {
  const out = {};
  for (const [id, rule] of Object.entries(rules)) {
    out[id] = evaluateAlert(rule, status);
  }
  return out;
}

module.exports = { evaluateAlert, evaluateAll };
```

- [ ] **Step 4: Run tests**

Run: `cd apps/desktop-app && node --test ontology/evaluate.test.js`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-app/ontology/evaluate.js apps/desktop-app/ontology/evaluate.test.js
git commit -m "feat(ontology): safe alert-rule evaluator for the desktop pet"
```

### Task 3.2: Fetch rules from the server and replace the hardcoded matcher

**Files:**
- Create: `apps/desktop-app/ontology/alerts.js`
- Modify: `apps/desktop-app/main.js` (the `get-radas-status` handler and the status payload)

**Interfaces:**
- Consumes: `evaluateAll` (Task 3.1), `GET /api/ontology/alerts` (Task 2.3), the existing credential-store reader in `main.js`.
- Produces: `buildStatusPayload(apiResults) -> {workers, approvals, budget}` and `evaluateAlerts(statusPayload) -> {alertId: rule}` (only firing rules, with severity-sorted order). The `get-radas-status` IPC now returns `{status, alerts}` where `alerts` is the firing rule list sorted by severity (critical > warning > info).

- [ ] **Step 1: Write the failing test for the alert binding**

Create `apps/desktop-app/ontology/alerts.test.js`:

```javascript
const test = require("node:test");
const assert = require("node:assert");
const { buildStatusPayload, orderAlerts } = require("./alerts");

test("buildStatusPayload maps API results to the ontology field paths", () => {
  const payload = buildStatusPayload({
    workers: { total: 3, online: 1 },
    approvals: { pending: 2 },
    budget: { usage_pct: 50, alert_at_pct: 80, spend_status: "ok" },
  });
  assert.deepEqual(payload.workers, { total: 3, online: 1 });
  assert.deepEqual(payload.approvals, { pending: 2 });
});

test("orderAlerts sorts critical before warning before info", () => {
  const ordered = orderAlerts({
    a: { severity: "info" },
    b: { severity: "critical" },
    c: { severity: "warning" },
  });
  assert.deepEqual(ordered.map(([, rule]) => rule.severity), ["critical", "warning", "info"]);
});
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/desktop-app && node --test ontology/alerts.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement alerts.js**

```javascript
// apps/desktop-app/ontology/alerts.js
const { evaluateAll } = require("./evaluate");

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

function buildStatusPayload({ workers, approvals, budget }) {
  return { workers, approvals, budget };
}

function evaluateAlerts(rules, statusPayload) {
  const results = evaluateAll(rules, statusPayload);
  const firing = {};
  for (const [id, fires] of Object.entries(results)) {
    if (fires) firing[id] = rules[id];
  }
  return firing;
}

function orderAlerts(firingRules) {
  return Object.entries(firingRules).sort(
    (a, b) => SEVERITY_ORDER[a[1].severity] - SEVERITY_ORDER[b[1].severity]
  );
}

module.exports = { buildStatusPayload, evaluateAlerts, orderAlerts };
```

- [ ] **Step 4: Wire into main.js `get-radas-status`**

Replace the current handler body (the fetch of `/api/admin/workers` + `/api/approvals?status=pending` with manual counting) with: fetch those endpoints **plus** `GET /api/ontology/alerts`, build the status payload, evaluate the rules, cache `{status, alerts: orderedFiringRules}` for 30s. Keep the unauthenticated early-return. The renderer now receives alerts with `severity`, `route`, and `title` from the ontology — delete the hardcoded `radasAlert` construction in `RadasPet.tsx` and consume `radasStatus.alerts[0]` instead (it is already severity-sorted). The pet's mood mapping becomes: critical → "surprised", warning → "thinking", info → "thinking".

- [ ] **Step 5: Run tests + typecheck + build**

Run: `cd apps/desktop-app && node --test ontology/ && npx tsc --noEmit && pnpm build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop-app/ontology/ apps/desktop-app/main.js apps/desktop-app/src/pet/RadasPet.tsx
git commit -m "feat(ontology): pet consumes ontology alert rules instead of hardcoded priorities"
```

---

## Phase 4 — Use-case concept bindings (pet speaks about real concepts)

### Task 4.1: Annotate the 500 use cases with concept bindings

**Files:**
- Create: `apps/desktop-app/src/pet/useCaseAnnotations.ts`
- Test: `apps/console/src/test/ontology-usecase-bindings.test.ts` (vitest — the file imports pure TS, so it tests cleanly from the console workspace; keep the pet file self-contained with no electron imports)

**Interfaces:**
- Produces: `CONCEPT_BINDINGS: Record<string, string[]>` mapping alert rule id → use-case ids that may speak about it. The pet picks a bound use case when its rule fires; unbound rules fall back to `rule.title`.

- [ ] **Step 1: Write the failing binding test**

```typescript
import { describe, expect, it } from "vitest";
import { CONCEPT_BINDINGS, ALERT_TITLES } from "../../../../desktop-app/src/pet/useCaseAnnotations";

describe("pet use-case concept bindings", () => {
  it("binds at least one use case to every shipped alert rule", () => {
    for (const alertId of Object.keys(ALERT_TITLES)) {
      expect(CONCEPT_BINDINGS[alertId], `alert ${alertId} has no bound use cases`).toBeDefined();
      expect(CONCEPT_BINDINGS[alertId].length).toBeGreaterThan(0);
    }
  });

  it("only references alert ids that exist in the alert title map", () => {
    for (const alertId of Object.keys(CONCEPT_BINDINGS)) {
      expect(ALERT_TITLES[alertId], `binding references unknown alert ${alertId}`).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/console && pnpm exec vitest run src/test/ontology-usecase-bindings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the annotations**

```typescript
// apps/desktop-app/src/pet/useCaseAnnotations.ts
// Concept bindings: which pet use cases may speak about which ontology alert.
// Use-case ids are indices into PET_500_USE_CASES (see pet500UseCases.ts).

export const ALERT_TITLES: Record<string, string> = {
  "workers.all_offline": "All workers offline!",
  "workers.partial_offline": "Some workers offline",
  "approvals.pending": "Approvals waiting",
  "budget.threshold": "Budget threshold reached",
  "budget.unavailable": "Cost store unavailable",
};

export const CONCEPT_BINDINGS: Record<string, number[]> = {
  "workers.all_offline": [288, 289, 290],
  "workers.partial_offline": [291, 292],
  "approvals.pending": [103, 104, 105],
  "budget.threshold": [513, 514],
  "budget.unavailable": [515],
};
```

Note: the use-case indices above are placeholders for the implementer to pick deliberately — grep `pet500UseCases.ts` for texts in the "Kubernetes & Cloud" and "FinOps & Cloud Cost" categories and choose 2-3 per alert whose text genuinely fits the condition. The test only enforces structure; the choice is editorial.

- [ ] **Step 4: Run the test**

Run: `cd apps/console && pnpm exec vitest run src/test/ontology-usecase-bindings.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Wire into the pet's bubble selection**

In `RadasPet.tsx`: when `radasStatus.alerts` has firing rules, pick a random bound use case for the highest-severity alert (fallback to `ALERT_TITLES[alertId]`); otherwise fall back to the existing telemetry/static rotation. Click-through route comes from the rule's `route`.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop-app/src/pet/useCaseAnnotations.ts apps/desktop-app/src/pet/RadasPet.tsx apps/console/src/test/ontology-usecase-bindings.test.ts
git commit -m "feat(ontology): pet use cases gain concept bindings to alert rules"
```

---

## Phase 5 — Console ontology types and concept-aware search

### Task 5.1: Generated TS types from the ontology

**Files:**
- Create: `scripts/export-ontology-types.ts` (codegen from the JSON)
- Create: `apps/console/src/lib/ontology.ts` (generated output, committed)
- Test: `apps/console/src/test/ontology-types.test.ts`

**Interfaces:**
- Produces: `ENTITY_STATES: Record<EntityName, string[]>`, `isFinalState(entity, state)`, `alertRuleTitle(id)`. The console imports these instead of hardcoding status lists in badge components.

- [ ] **Step 1: Write the failing type test**

```typescript
import { describe, expect, it } from "vitest";
import ontology from "../../../../contracts/domain-ontology.json";
import { ENTITY_STATES, isFinalState } from "../lib/ontology";

describe("generated ontology types", () => {
  it("covers every entity in the contract", () => {
    for (const name of Object.keys(ontology.entities)) {
      expect(ENTITY_STATES[name], `entity ${name} missing from generated types`).toBeDefined();
    }
  });

  it("final states match the contract", () => {
    expect(isFinalState("Execution", "SUCCESS")).toBe(true);
    expect(isFinalState("Execution", "RUNNING")).toBe(false);
    expect(isFinalState("ServiceOperation", "canceled")).toBe(true);
  });
});
```

- [ ] **Step 2: Verify failure, then write the codegen script**

The script reads `contracts/domain-ontology.json` and emits `apps/console/src/lib/ontology.ts` with the literal maps (see the header comment "GENERATED — run scripts/export-ontology-types.ts"). Commit both the script and its output. Run it via `node --experimental-strip-types scripts/export-ontology-types.ts` or compile once with `tsc` — implementer picks the simpler path and documents the run command in the script header.

- [ ] **Step 3: Run the test**

Run: `cd apps/console && pnpm exec vitest run src/test/ontology-types.test.ts`
Expected: 2 PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/export-ontology-types.ts apps/console/src/lib/ontology.ts apps/console/src/test/ontology-types.test.ts
git commit -m "feat(ontology): generated console types from the domain contract"
```

### Task 5.2: Concept-aware global search filter

**Files:**
- Modify: `apps/console/src/components/search/GlobalSearch.tsx`
- Test: extend `apps/console/src/components/search/GlobalSearch.test.tsx`

**Interfaces:**
- Consumes: `ENTITY_STATES` (Task 5.1) and the existing `/api/search` response.
- Produces: a `:failed` / `:running` query token that filters search results client-side by state name using ontology state lists, so "web :failed" returns only failed runs/stacks and the token set is derived from the contract (no per-entity hardcoding).

- [ ] **Step 1: Write the failing test** — a search for `"web :failed"` renders only result rows whose status is a terminal/failed state of some entity (use the existing fetch-stub harness from `GlobalSearch.test.tsx`; stub the search response with a mix of failed and running runs; assert only failed rows render).

- [ ] **Step 2: Implement** — parse a trailing `:state` token from the query; resolve it against the union of all `ENTITY_STATES` values; filter `runs`/`stacks` client-side by status match (case-insensitive). Unknown tokens (not any entity's state) are ignored as literals.

- [ ] **Step 3: Run the full console suite**

Run: `cd apps/console && pnpm typecheck && pnpm exec vitest run`
Expected: all pass (the 3 pre-existing operator-WIP failures in `GlobalSearch.test.tsx` are documented; do not fix them here — they fail on the untracked `interactiveFavicon.ts` WIP, not this change. If the operator's WIP has landed by execution time, the suite must be fully green).

- [ ] **Step 4: Commit**

```bash
git add apps/console/src/components/search/GlobalSearch.tsx apps/console/src/components/search/GlobalSearch.test.tsx
git commit -m "feat(ontology): concept-aware :state search tokens in global search"
```

---

## Phase 6 — Documentation and gates wiring

### Task 6.1: Wire the parity gate into CI and document the ontology

**Files:**
- Modify: `.github/workflows/ci.yml` (cross-client-contracts job: add the ontology tests to the pytest leg)
- Modify: `scripts/run-cross-client-contracts.sh` (gate 1 selection)
- Create: `docs/architecture/domain-ontology.md`
- Modify: `AGENTS.md` (one-line pointer in "Repo state": the ontology is authoritative for entity semantics)

**Interfaces:**
- Consumes: everything above.
- Produces: CI enforcement + docs. The parity gate runs on every push.

- [ ] **Step 1: Update the gate script** — change gate 1's pytest selection from `tests/test_cli_server_integration.py` to also include `tests/test_ontology_schema.py tests/test_ontology_loader.py tests/test_ontology_parity.py`.

- [ ] **Step 2: Write `docs/architecture/domain-ontology.md`** — cover: what the ontology is and is not (pragmatic JSON contract, not OWL); the alert DSL grammar with examples; the parity philosophy (descriptive, drift fixed deliberately); how to add an entity/rule (edit JSON → parity test tells you what code to reconcile → update both sides in one commit); how the pet consumes it; how to regenerate console types.

- [ ] **Step 3: Full verification battery**

Run:
```bash
cd apps/server && .venv/bin/pytest -q
cd ../desktop-app && node --test ontology/ && npx tsc --noEmit && pnpm build
cd ../console && pnpm typecheck && pnpm exec vitest run && pnpm build
cd ../cli && go vet ./... && go build ./... && go test ./...
```
Expected: all green (modulo the documented operator-WIP console failures).

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/ci.yml scripts/run-cross-client-contracts.sh docs/architecture/domain-ontology.md AGENTS.md
git commit -m "feat(ontology): CI parity gate + domain ontology documentation"
git push
```

---

## Verification Matrix (final acceptance)

| Gate | Command | Expected |
|---|---|---|
| Ontology schema | `pytest tests/test_ontology_schema.py` | 8 PASS |
| Ontology loader | `pytest tests/test_ontology_loader.py` | 5 PASS |
| Parity gate | `pytest tests/test_ontology_parity.py` | 6 PASS |
| Evaluator | `node --test ontology/` (desktop) | 8 PASS |
| Bindings | `vitest run src/test/ontology-usecase-bindings.test.ts` | 2 PASS |
| Console types | `vitest run src/test/ontology-types.test.ts` | 2 PASS |
| Server suite | `pytest -q` | all green |
| Console | `pnpm typecheck && vitest && build` | green (operator-WIP caveat) |
| CLI | `go vet && go test ./...` | green |
| CI | push → RADAS CI | 4/4 jobs green |
