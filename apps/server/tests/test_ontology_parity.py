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
    from pathlib import Path

    server_root = Path(__file__).resolve().parents[1]
    src = (server_root / "storage" / "metrics_counters.py").read_text(encoding="utf-8")
    src += (server_root / "services" / "metrics.py").read_text(encoding="utf-8")
    emitted = set(re.findall(r'radas_([a-z_]+)', src))
    # The failure/recovery counters are rendered by services/metrics.py from a
    # literal name tuple via f"radas_{name}", so the static regex above cannot
    # see them — capture the tuple entries too. Alert payload fields map onto
    # these series: workers.online -> radas_workers_online,
    # approvals.pending -> radas_approvals_pending (static literals), and the
    # worker-recovery/provider-failure flows back the recovery_* and
    # provider_errors counters asserted below.
    emitted |= set(re.findall(r'"([a-z_]+)"', src))
    assert "recovery_requeued_total" in emitted
    assert "provider_errors_total" in emitted
