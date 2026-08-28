"""End-to-end journey matrix (Task 7.2 of the 2026-08-27 integration plan).

One test per product journey, driven through the REAL blueprint set against
real PostgreSQL test data (same harness as tests/test_cli_server_integration.py,
which provides the fixtures' seam-mirroring rationale). Companion doc:
docs/architecture/e2e-flow-matrix.md records, per journey, the server /
console / CLI evidence and where a client leg is intentionally absent.

  J1 login -> org/project scope -> project dashboard
  J2 create service -> queued operation -> worker claim -> finish + audit
  J3 CLI parity            (server reference half lives in J1/J2; the Go and
                            TypeScript legs live in the cross-client tests)
  J4 branch webhook -> mapping -> approval -> deploy
  J5 apply/destroy conflict -> visible conflict -> release -> retry
  J6 provider failure -> terminal audit -> visible failure notification
  J7 global search -> project-scoped detail without secret leakage
  J8 cost store failure -> unavailable state -> recovery
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import flask
import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = Path(__file__).resolve().parent
for _p in (str(SERVER_ROOT), str(TESTS_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from test_cli_server_integration import (  # noqa: E402
    CATALOG_SLUG,
    CATALOG_VERSION,
    FOREIGN_PROJECT,
    ORG,
    PASSWORD,
    PROJECT,
    USERNAME,
    _deploy_payload,
    _manifest,
    _seed_org_project,
)


@pytest.fixture
def journey_client(data_dir, monkeypatch):
    """Same harness as contract_client: real blueprints, real PG rows,
    isolated data_dir (see test_cli_server_integration for the seams)."""
    from api import register_blueprints
    from api import auth_routes as ar
    from api import platform_routes as platform
    from api import projects_routes as pr
    from auth.middleware import set_data_dir
    from services.login_security import _login_failures
    from services import service_catalog
    from services.user_service import UserService
    from storage import config_db
    from app_context import set_projects_dir

    idem_cache = data_dir / "idempotency.json"
    monkeypatch.setattr(platform, "_idem_path", lambda: idem_cache)
    set_projects_dir(data_dir / "projects")

    user = UserService(data_dir).create_user(USERNAME, PASSWORD, email="e2e-matrix@example.com")
    _seed_org_project(ORG, PROJECT, user.id)
    _seed_org_project(ORG + "-foreign", FOREIGN_PROJECT, "foreign-owner")
    service_catalog.publish_definition(_manifest(), USERNAME, None, scope="platform")

    class _Stub:
        def get_role_by_id(self, role_id):
            return None

        def get_user_permissions(self, user_id):
            return set()

    def fake_services():
        return (UserService(data_dir), _Stub(), _Stub(), data_dir)

    monkeypatch.setattr(ar, "_services", fake_services)
    set_data_dir(data_dir)
    _login_failures.clear()

    def fake_load_projects(*, strict=False):
        return config_db.list_projects(data_dir)

    monkeypatch.setattr(pr, "load_projects", fake_load_projects)

    app = flask.Flask(__name__)
    app.config["TESTING"] = True
    register_blueprints(app)
    client = app.test_client()
    login = client.post("/api/auth/login", json={"username": USERNAME, "password": PASSWORD})
    assert login.status_code == 200, "journey harness: login must succeed"
    token = login.get_json()["access_token"]
    client.token = token  # type: ignore[attr-defined]
    return client


def _auth(client) -> dict[str, str]:
    return {"Authorization": f"Bearer {client.token}"}


# ---------------------------------------------------------------------------
# J1: login -> org/project scope -> project dashboard
# ---------------------------------------------------------------------------

def test_journey_01_login_project_scope_dashboard(journey_client):
    client = journey_client

    projects = client.get("/api/projects", headers=_auth(client))
    assert projects.status_code == 200
    listed = {p["id"] for p in projects.get_json()["projects"]}
    assert PROJECT in listed, "journey=J1: the user's project must be listed"
    assert FOREIGN_PROJECT not in listed, "journey=J1: foreign-org project must never leak"

    dashboard = client.get(f"/api/projects/{PROJECT}/dashboard", headers=_auth(client))
    assert dashboard.status_code == 200, f"journey=J1: dashboard failed: {dashboard.status_code}"
    foreign = client.get(f"/api/projects/{FOREIGN_PROJECT}/dashboard", headers=_auth(client))
    assert foreign.status_code in (403, 404), (
        "journey=J1: the foreign project dashboard must be denied without existence leak semantics"
    )


# ---------------------------------------------------------------------------
# J2: create service -> queued -> worker claim -> finish + audit trail
# ---------------------------------------------------------------------------

def test_journey_02_service_deploy_queue_claim_finish(journey_client):
    client = journey_client
    from services.service_operation_runner import claim_next_operation, finish_operation, list_events

    created = client.post(
        f"/api/projects/{PROJECT}/services",
        json=_deploy_payload("e2e-journey-svc"),
        headers={**_auth(client), "Idempotency-Key": "e2e-journey-deploy-1"},
    )
    assert created.status_code == 202, f"journey=J2: deploy must be accepted, got {created.status_code}"
    operation = created.get_json()["operation"]
    assert operation["status"] == "queued", "journey=J2: a queued (not started) operation is the contract"

    claimed = claim_next_operation("e2e-worker-j2", project_id=PROJECT)
    assert claimed is not None, "journey=J2: the queued operation must be claimable by a worker"
    operation_id = claimed["operation_id"] if isinstance(claimed, dict) and "operation_id" in claimed else claimed["id"]

    finished = finish_operation(operation_id, "e2e-worker-j2", success=True)
    assert finished is not None, "journey=J2: the worker must be able to finish the operation"

    events = list_events(operation_id)
    assert events, "journey=J2: the operation must leave an audit event trail"


# ---------------------------------------------------------------------------
# J4: branch webhook -> mapping -> approval -> deploy
# ---------------------------------------------------------------------------

def test_journey_04_branch_webhook_mapping_approval_deploy(journey_client, data_dir):
    client = journey_client
    from services import approval_service, branch_mapping, inbound_webhooks
    from services.cloud_provisioning import _stack_dir

    # Branch mapping decides preview vs production from the branch name.
    rules = [
        {"pattern": "feature/*", "environment": "preview"},
        {"pattern": "main", "environment": "prod"},
    ]
    branch_mapping.set_mapping(PROJECT, "e2e-stack", rules)
    preview = branch_mapping.resolve_environment(PROJECT, "e2e-stack", "feature/journey")
    production = branch_mapping.resolve_environment(PROJECT, "e2e-stack", "main")
    assert preview.get("environment") == "preview", f"journey=J4: feature branch -> preview, got {preview}"
    assert production.get("environment") == "prod", f"journey=J4: main -> prod, got {production}"

    # Approval lifecycle for the protected action.
    approval = approval_service.create_approval("e2e-stack", PROJECT, "apply", requested_by="journey")
    assert approval is not None and approval.get("id"), "journey=J4: approval must be created"
    approved = approval_service.approve_approval(approval["id"], decided_by="journey-approver")
    assert approved is not None and approved.get("status") in ("approved", "APPROVED"), (
        f"journey=J4: approval must be decidable, got {approved}"
    )

    # Signed inbound webhook triggers a stack execution for the mapped stack.
    _stack_dir(PROJECT, "e2e-stack").mkdir(parents=True, exist_ok=True)
    webhook = inbound_webhooks.create("e2e-journey-wh", "whsec-e2e", "e2e-stack", "plan", PROJECT)
    assert webhook, "journey=J4: inbound webhook must be registered"
    body = json.dumps({"ref": "refs/heads/main"}).encode("utf-8")
    import hashlib
    import hmac as hmac_mod

    signature = "sha256=" + hmac_mod.new(b"whsec-e2e", body, hashlib.sha256).hexdigest()
    triggered = inbound_webhooks.trigger("e2e-journey-wh", body, signature)
    assert triggered[0].get("ok") is True, f"journey=J4: signed webhook must trigger, got {triggered}"
    assert triggered[0].get("execution_id"), "journey=J4: the trigger must create an execution"

    # The deploy leg the journey ends with: the service mutation is accepted.
    deployed = client.post(
        f"/api/projects/{PROJECT}/services",
        json=_deploy_payload("e2e-journey-mapped"),
        headers={**_auth(client), "Idempotency-Key": "e2e-journey-deploy-2"},
    )
    assert deployed.status_code == 202, "journey=J4: post-approval deploy must be accepted (202)"


# ---------------------------------------------------------------------------
# J5: lock conflict -> visible conflict -> release -> retry succeeds
# ---------------------------------------------------------------------------

def test_journey_05_lock_conflict_release_retry(journey_client):
    from services import lock_lifecycle

    first = lock_lifecycle.acquire_for_execution(
        PROJECT, "e2e-stack", "apply", actor="journey-w1",
    )
    assert first["project"].get("ok"), "journey=J5: the first mutating run must acquire the project lock"

    second = lock_lifecycle.acquire_for_execution(
        PROJECT, "e2e-stack", "apply", actor="journey-w2",
    )
    assert not second["project"].get("ok"), (
        "journey=J5: the concurrent apply must see a visible lock conflict"
    )

    released = lock_lifecycle.release_for_acquisition(first, stack="e2e-stack", project_id=PROJECT)
    assert released >= 1, "journey=J5: the holder must be able to release"

    retry = lock_lifecycle.acquire_for_execution(
        PROJECT, "e2e-stack", "apply", actor="journey-w2",
    )
    assert retry["project"].get("ok"), "journey=J5: the retry after release must succeed"
    lock_lifecycle.release_for_acquisition(retry, stack="e2e-stack", project_id=PROJECT)


# ---------------------------------------------------------------------------
# J6: provider failure -> terminal audit -> visible failure notification
# ---------------------------------------------------------------------------

def test_journey_06_provider_failure_recovery_notification(journey_client):
    client = journey_client
    from services.runtime_provider import RuntimeProviderTimeoutError
    from services.runtime_providers.mock import MockRuntimeProvider
    from services.runtime_registry import RuntimeProviderRegistry
    from services.webhook_dispatcher import clear_webhook_dlq, dispatch_webhook_with_dlq, list_webhook_dlq
    from storage.metrics_counters import get as counter

    provider = MockRuntimeProvider()
    provider.configure_failure(RuntimeProviderTimeoutError())
    result = RuntimeProviderRegistry([provider]).deploy(
        "mock", f"e2e-journey-op-{int(time.time())}", {"name": "e2e-journey-svc"},
    )
    assert result.success is False and (result.error or {}).get("code") == "PROVIDER_TIMEOUT", (
        "journey=J6: the provider failure must terminalize with a typed audit code"
    )

    # The failure notification path: delivery that keeps failing dead-letters
    # visibly instead of being lost.
    def failing_sender(url, payload):
        raise ConnectionError("notification endpoint down")

    notified = dispatch_webhook_with_dlq(
        "http://127.0.0.1:9/unreachable", "execution.failed",
        {"operation": "e2e-journey-op", "code": "PROVIDER_TIMEOUT"},
        max_retries=2, sender_fn=failing_sender,
    )
    assert notified["status"] == "dlq", "journey=J6: the failed notification must dead-letter"
    dlq = list_webhook_dlq()
    assert any(e.get("id") == notified["dlq_id"] for e in dlq), (
        "journey=J6: the failed delivery must stay visible in the DLQ"
    )
    clear_webhook_dlq(notified["dlq_id"])

    assert counter("provider_errors_total") >= 1
    assert counter("webhook_delivery_failures_total") >= 1


# ---------------------------------------------------------------------------
# J7: global search -> project-scoped detail without secret leakage
# ---------------------------------------------------------------------------

def test_journey_07_global_search_no_secret_leakage(journey_client):
    from services.global_search import search
    from storage import pg

    now = time.time()
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s) "
        "ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data",
        (PROJECT, "e2e-web-stack", json.dumps({"provider": "hetzner", "env": "preview"})),
    )
    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s) "
        "ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data",
        (FOREIGN_PROJECT, "e2e-web-stack-foreign", json.dumps({"provider": "gke"})),
    )
    pg.execute(
        "INSERT INTO stack_secrets (project_id, stack, data) VALUES (%s, %s, %s) "
        "ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data",
        (PROJECT, "e2e-web-stack", b"encrypted-payload-containing-e2e"),
    )

    results = search("e2e-web", project_id=PROJECT)
    stack_names = [s["name"] for s in results.get("stacks", [])]
    assert "e2e-web-stack" in stack_names, f"journey=J7: scoped search must find the stack, got {stack_names}"
    assert "e2e-web-stack-foreign" not in stack_names, "journey=J7: foreign stacks must not leak into scope"
    for secret in results.get("secrets", []):
        assert "name" not in secret and "value" not in secret and "data" not in secret, (
            f"journey=J7: secret projections must not expose name/value/data, got keys {sorted(secret)}"
        )


# ---------------------------------------------------------------------------
# J8: cost store failure -> unavailable state -> recovery
# ---------------------------------------------------------------------------

def test_journey_08_cost_store_failure_unavailable_recovery(journey_client, monkeypatch):
    from services import budget_service

    saved = budget_service.save_budget(PROJECT, 100.0, "USD", 80)
    assert saved, "journey=J8: the budget must be storable"

    def broken_spend(project_id):
        raise RuntimeError("cost store unreachable")

    monkeypatch.setattr(budget_service, "current_spend", broken_spend)
    unavailable = budget_service.check_budget(PROJECT)
    assert unavailable["spend"] is None, "journey=J8: spend must be null, never a false zero"
    assert unavailable["spend_status"] == "unavailable", (
        f"journey=J8: status must be 'unavailable', got {unavailable.get('spend_status')}"
    )

    monkeypatch.setattr(budget_service, "current_spend", lambda project_id: 50.0)
    recovered = budget_service.check_budget(PROJECT)
    assert recovered["spend_status"] == "ok", "journey=J8: after recovery the budget must evaluate normally"
    assert recovered["spend"] == 50.0
