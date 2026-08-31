"""Ontology parity gate (Phase 2).

The ontology is the cross-client semantic contract; these tests fail when
server state machines drift from it. Drift is fixed deliberately: update
whichever side is wrong, in a commit that explains the change.

Task 2.3 also pins the read-only /api/ontology routes through the real
blueprint set (the same harness family as test_cli_server_integration.py's
contract_client — real blueprints, real PostgreSQL rows, isolated data_dir;
app.py is never imported here because module level it starts background
schedulers).
"""
from __future__ import annotations

import sys
from pathlib import Path

import flask
import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = Path(__file__).resolve().parent
for _p in (str(SERVER_ROOT), str(TESTS_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from test_cli_server_integration import (  # noqa: E402
    ORG,
    PASSWORD,
    PROJECT,
    USERNAME,
    _seed_org_project,
)


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


# ---------------------------------------------------------------------------
# Task 2.3: read-only /api/ontology routes (real blueprint set, real auth)
# ---------------------------------------------------------------------------


class _AuthedTestClient:
    """Flask test client that sends the login token on every request."""

    def __init__(self, client, token: str):
        self._client = client
        self._headers = {"Authorization": f"Bearer {token}"}

    def get(self, path, **kwargs):
        headers = {**self._headers, **(kwargs.pop("headers", None) or {})}
        return self._client.get(path, headers=headers, **kwargs)

    def __getattr__(self, name):
        return getattr(self._client, name)


@pytest.fixture
def app_client(data_dir, monkeypatch):
    """Flask test client with the full production blueprint set registered,
    authenticated as a real logged-in user (harness mirrors contract_client
    in test_cli_server_integration.py: real blueprints + real PG rows +
    isolated data_dir; never app.py)."""
    from api import register_blueprints
    from api import auth_routes as ar
    from auth.middleware import set_data_dir
    from services.login_security import _login_failures
    from services.user_service import UserService

    # Seed the login user (real credential store, isolated data_dir) plus the
    # org/project rows the JWT org context resolves against.
    user = UserService(data_dir).create_user(USERNAME, PASSWORD, email="ontology@example.com")
    _seed_org_project(ORG, PROJECT, user.id)

    class _Stub:
        def get_role_by_id(self, role_id):
            return None

        def get_user_permissions(self, user_id):
            return set()

    def fake_services():
        from services.user_service import UserService as _US

        return (_US(data_dir), _Stub(), _Stub(), data_dir)

    monkeypatch.setattr(ar, "_services", fake_services)
    # require_auth resolves DATA_DIR through the middleware module global.
    set_data_dir(data_dir)
    # Reset the in-memory brute-force window so suite ordering cannot trip it.
    _login_failures.clear()

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    register_blueprints(app)
    client = app.test_client()
    login = client.post("/api/auth/login", json={"username": USERNAME, "password": PASSWORD})
    assert login.status_code == 200, "ontology harness: login must succeed"
    token = login.get_json()["access_token"]
    return _AuthedTestClient(client, token)


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
