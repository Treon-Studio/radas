"""Budget failure semantics, input validation & alert delivery (Phase 5 — Task 5.5).

Pins:
- Cost-store failures are never reported as 0.0 spend: ``current_spend``
  raises and ``check_budget`` returns ``spend=None`` with
  ``spend_status="unavailable"`` while preserving budget amount/currency.
- ``load_budgets`` keeps the ``{}`` fallback for list contexts but logs the
  stable ``budget.kv_load_failed`` event; unconfigured budgets stay
  ``{"configured": False}``.
- ``save_budget`` rejects negative, NaN, infinite and oversized amounts and
  out-of-range ``alert_at_pct``; the route answers 400 with the legacy
  ``{error, message}`` envelope.
- Alert dispatch is deduplicated within ``ALERT_DEDUPE_SECONDS`` so scheduled
  checks do not spam webhooks, and failed dispatches land in the
  ``budget_alert_dlq`` KV scope for retry.
- Project aggregation sums estimates across multiple stacks.
"""
from __future__ import annotations

import logging
import time

import flask
import pytest

from api import register_blueprints
from auth.service import generate_token
from services import budget_service
from storage import kv, pg

ORG, PROJECT, USER = "budget-org", "budget-project", "budget-user"


@pytest.fixture
def seeded(pg_db, data_dir):
    """Fresh schema + org/project/member rows + isolated auth data dir."""
    now = time.time()
    pg.execute(
        "INSERT INTO orgs (id, name, created_by, created_at) VALUES (%s, %s, %s, %s)",
        (ORG, ORG, USER, now),
    )
    pg.execute(
        "INSERT INTO projects (id, org_id, owner_id, name, description, is_archived, created_at, updated_at) "
        "VALUES (%s, %s, %s, %s, '', 0, %s, %s)",
        (PROJECT, ORG, USER, PROJECT, now, now),
    )
    pg.execute(
        "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (%s, %s, %s, %s)",
        (ORG, USER, "owner", now),
    )
    from auth import middleware

    middleware.set_data_dir(data_dir)
    return data_dir


def _route_client(data_dir):
    app = flask.Flask("budget-route-tests")
    app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False)
    register_blueprints(app)
    headers = {
        "Authorization": "Bearer "
        + generate_token(USER, USER, [], data_dir, token_type="access")
    }
    return app.test_client(), headers


def _save_estimate(project_id: str, payload: dict) -> None:
    from storage.cost_store import save_estimate

    save_estimate(project_id, payload)


# ---------------------------------------------------------------------------
# 1. Spend failure semantics
# ---------------------------------------------------------------------------


def test_current_spend_sums_estimates_across_stacks(seeded):
    _save_estimate(PROJECT, {"stack": "stack-a", "estimated_cost": 10.5})
    _save_estimate(PROJECT, {"stack": "stack-b", "amount": 5.25})
    _save_estimate(PROJECT, {"stack": "stack-c", "cost": 4.25})
    assert budget_service.current_spend(PROJECT) == pytest.approx(20.0)


def test_current_spend_raises_when_cost_storage_fails(seeded, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("cost storage unavailable")

    monkeypatch.setattr(kv, "kv_load", boom)
    with pytest.raises(RuntimeError):
        budget_service.current_spend(PROJECT)


def test_check_budget_marks_spend_unavailable_not_zero(seeded, monkeypatch):
    budget_service.save_budget(PROJECT, 100.0, "USD", 80)
    dispatched: list = []
    monkeypatch.setattr(
        "services.webhook_dispatcher.dispatch_event",
        lambda event, payload: dispatched.append((event, payload)) or 1,
    )
    monkeypatch.setattr(
        "storage.cost_store.list_estimates_strict",
        lambda pid: (_ for _ in ()).throw(RuntimeError("cost storage unavailable")),
    )
    result = budget_service.check_budget(PROJECT)
    assert result["configured"] is True
    assert result["spend"] is None
    assert result["spend_status"] == "unavailable"
    # Budget amount/currency preserved; nothing alerted or dispatched.
    assert result["budget"] == 100.0
    assert result["currency"] == "USD"
    assert result["alerted"] is False
    assert dispatched == []


def test_check_budget_ok_shape_on_success(seeded, monkeypatch):
    budget_service.save_budget(PROJECT, 100.0, "USD", 80)
    dispatched: list = []
    monkeypatch.setattr(
        "services.webhook_dispatcher.dispatch_event",
        lambda event, payload: dispatched.append((event, payload)) or 1,
    )
    monkeypatch.setattr(
        "storage.cost_store.list_estimates_strict",
        lambda pid: [{"estimated_cost": 90.0}],
    )
    result = budget_service.check_budget(PROJECT)
    assert result["configured"] is True
    assert result["spend"] == 90.0
    assert result["spend_status"] == "ok"
    assert result["budget"] == 100.0
    assert result["currency"] == "USD"
    assert result["usage_pct"] == 90.0
    assert result["alerted"] is True
    assert result["alert_dispatched"] is True
    assert len(dispatched) == 1 and dispatched[0][0] == "budget.alert"


# ---------------------------------------------------------------------------
# 2. KV failure on budget config load
# ---------------------------------------------------------------------------


def test_load_budgets_kv_failure_returns_empty_and_logs(seeded, monkeypatch, caplog):
    def boom(*args, **kwargs):
        raise RuntimeError("kv down")

    monkeypatch.setattr(kv, "kv_load", boom)
    with caplog.at_level(logging.ERROR):
        assert budget_service.load_budgets() == {}
    assert "budget.kv_load_failed" in caplog.text


def test_check_budget_unconfigured_when_budget_load_fails(seeded, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("kv down")

    monkeypatch.setattr(kv, "kv_load", boom)
    # Missing/failed budget config keeps the legacy unconfigured shape.
    assert budget_service.check_budget(PROJECT) == {
        "configured": False,
        "spend": 0.0,
        "alerted": False,
    }


def test_check_budget_unconfigured_when_no_budget(seeded):
    assert budget_service.check_budget(PROJECT) == {
        "configured": False,
        "spend": 0.0,
        "alerted": False,
    }


# ---------------------------------------------------------------------------
# 3. Input validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_amount",
    [-5.0, 0.0, float("nan"), float("inf"), float("-inf"), 1e12 + 1, "not-a-number"],
)
def test_save_budget_rejects_invalid_amounts(seeded, bad_amount):
    with pytest.raises(ValueError):
        budget_service.save_budget(PROJECT, bad_amount, "USD", 80)


def test_save_budget_accepts_boundary_amount(seeded):
    record = budget_service.save_budget(PROJECT, 1e12, "USD", 80)
    assert record["amount"] == 1e12


@pytest.mark.parametrize("bad_pct", [0, -1, 101, float("nan"), float("inf")])
def test_save_budget_rejects_invalid_alert_at_pct(seeded, bad_pct):
    with pytest.raises(ValueError):
        budget_service.save_budget(PROJECT, 100.0, "USD", bad_pct)


def test_save_budget_accepts_boundary_alert_at_pct(seeded):
    assert budget_service.save_budget(PROJECT, 100.0, "USD", 1)["alert_at_pct"] == 1.0
    assert budget_service.save_budget(PROJECT, 100.0, "USD", 100)["alert_at_pct"] == 100.0


def test_put_budget_route_rejects_invalid_inputs_with_400(seeded):
    client, headers = _route_client(seeded)
    for body, err_key in [
        ({"amount": -5}, "invalid amount"),
        ({"amount": "NaN"}, "invalid amount"),
        ({"amount": "inf"}, "invalid amount"),
        ({"amount": 5e12}, "invalid amount"),
        ({"amount": 100, "alert_at_pct": 150}, "invalid alert_at_pct"),
        ({"amount": 100, "alert_at_pct": 0}, "invalid alert_at_pct"),
    ]:
        resp = client.put(f"/api/budget/{PROJECT}", headers=headers, json=body)
        assert resp.status_code == 400, body
        payload = resp.get_json()
        assert payload["error"] == err_key, body
        assert payload["message"], body


def test_put_budget_route_still_accepts_valid_input(seeded):
    client, headers = _route_client(seeded)
    resp = client.put(
        f"/api/budget/{PROJECT}", headers=headers, json={"amount": 250, "currency": "EUR", "alert_at_pct": 75}
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert body["budget"]["amount"] == 250
    assert body["budget"]["currency"] == "EUR"
    assert body["budget"]["alert_at_pct"] == 75
    fetched = client.get(f"/api/budget/{PROJECT}", headers=headers)
    assert fetched.status_code == 200 and fetched.get_json()["configured"] is True


# ---------------------------------------------------------------------------
# 4. Alert delivery: dedupe window + failure DLQ
# ---------------------------------------------------------------------------


def _over_budget_env(seeded, monkeypatch, dispatched):
    budget_service.save_budget(PROJECT, 100.0, "USD", 50)
    monkeypatch.setattr(
        "services.webhook_dispatcher.dispatch_event",
        lambda event, payload: dispatched.append((event, payload)) or 1,
    )
    monkeypatch.setattr(
        "storage.cost_store.list_estimates_strict",
        lambda pid: [{"estimated_cost": 200.0}],
    )


def test_check_budget_does_not_redispatch_within_dedupe_window(seeded, monkeypatch):
    dispatched: list = []
    _over_budget_env(seeded, monkeypatch, dispatched)
    first = budget_service.check_budget(PROJECT)
    second = budget_service.check_budget(PROJECT)
    assert first["alerted"] is True and first["alert_dispatched"] is True
    # Condition still met, but the scheduled check must not re-dispatch.
    assert second["alerted"] is True
    assert second["alert_dispatched"] is False
    assert second["alert_deduped"] is True
    assert len(dispatched) == 1


def test_check_budget_redispatches_after_dedupe_window_expires(seeded, monkeypatch):
    dispatched: list = []
    _over_budget_env(seeded, monkeypatch, dispatched)
    budget_service.check_budget(PROJECT)
    record = budget_service.get_budget(PROJECT)
    record["last_alerted_at"] = time.time() - (budget_service.ALERT_DEDUPE_SECONDS + 1)
    kv.kv_set("budgets", PROJECT, record)
    budget_service.check_budget(PROJECT)
    assert len(dispatched) == 2


def test_failed_alert_dispatch_recorded_to_dlq_for_retry(seeded, monkeypatch, caplog):
    dispatched: list = []
    _over_budget_env(seeded, monkeypatch, dispatched)

    def boom(event, payload):
        raise RuntimeError("webhook registry down")

    monkeypatch.setattr("services.webhook_dispatcher.dispatch_event", boom)
    with caplog.at_level(logging.ERROR):
        result = budget_service.check_budget(PROJECT)
    assert result["alerted"] is True
    assert result["alert_dispatched"] is False
    assert "budget.alert_dispatch_failed" in caplog.text

    entries = budget_service.list_budget_alert_failures(project_id=PROJECT)
    assert len(entries) == 1
    entry = entries[0]
    assert entry["project_id"] == PROJECT
    assert entry["error_type"] == "RuntimeError"
    assert entry["payload"]["project_id"] == PROJECT
    assert entry["payload"]["currency"] == "USD"

    # A failed dispatch must not arm the dedupe window: retry succeeds.
    assert not (budget_service.get_budget(PROJECT) or {}).get("last_alerted_at")
    monkeypatch.setattr(
        "services.webhook_dispatcher.dispatch_event", lambda event, payload: 1
    )
    retry = budget_service.check_budget(PROJECT)
    assert retry["alert_dispatched"] is True
