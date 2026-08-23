import pytest
import time


def test_worker_metrics_and_status(pg_db):
    from services.worker_metrics import record_worker_metrics
    from services.worker_status import get_worker_health_status

    now = 1700000000.0

    # 1. Record metrics for worker-01
    entry = record_worker_metrics(
        worker_id="worker-node-01",
        cpu_percent=42.5,
        memory_percent=68.0,
        disk_percent=30.0,
        recorded_at=now,
    )
    assert entry["worker_id"] == "worker-node-01"
    assert entry["cpu_percent"] == 42.5

    # 2. Check health status within timeout -> Online
    status_online = get_worker_health_status(
        worker_id="worker-node-01",
        timeout_seconds=60,
        current_time=now + 20,
    )
    assert status_online["status"] == "online"
    assert status_online["online"] is True
    assert status_online["metrics"]["memory_percent"] == 68.0

    # 3. Check health status after timeout -> Offline
    status_offline = get_worker_health_status(
        worker_id="worker-node-01",
        timeout_seconds=60,
        current_time=now + 120,
    )
    assert status_offline["status"] == "offline"
    assert status_offline["online"] is False


def test_cost_forecast_mae_accuracy():
    from services.cost_accuracy import calculate_forecast_mae

    forecast = [100.0, 150.0, 200.0, 250.0]
    actual = [110.0, 140.0, 210.0, 260.0]  # Errors: 10, 10, 10, 10 -> MAE = 10.0

    res = calculate_forecast_mae(forecast, actual)
    assert res["mae"] == 10.0
    assert res["samples"] == 4
    assert res["accuracy_pct"] > 90.0


def test_env_chargeback_free_tier():
    from services.env_charge import calculate_env_chargeback

    stacks = [
        {"stack": "prod-db", "env": "production", "cost": 300.0},
        {"stack": "staging-api", "env": "staging", "cost": 100.0},
        {"stack": "dev-sandbox", "env": "development", "cost": 50.0},
        {"stack": "pr-preview-9", "env": "preview", "cost": 25.0},
    ]

    res = calculate_env_chargeback("p-finops", stacks, dev_free_tier=True)
    assert res["total_cost"] == 475.0
    assert res["billable_cost"] == 400.0  # 300 + 100 (prod + staging)
    assert res["free_tier_savings"] == 75.0  # 50 + 25 (dev + preview waived)


def test_hierarchical_budget_rollup():
    from services.budget_rollup import rollup_org_budgets

    child_projects = [
        {"project_id": "proj-auth", "budget": 1000.0, "actual_spend": 750.0},
        {"project_id": "proj-billing", "budget": 2000.0, "actual_spend": 2400.0},  # Over budget!
        {"project_id": "proj-search", "budget": 500.0, "actual_spend": 300.0},
    ]

    rollup = rollup_org_budgets("org-global-corp", child_projects)
    assert rollup["total_budget"] == 3500.0
    assert rollup["total_spend"] == 3450.0
    assert len(rollup["over_budget_projects"]) == 1
    assert rollup["over_budget_projects"][0]["project_id"] == "proj-billing"


def test_rightsizing_recommendations():
    from services.rightsizing_advisor import generate_rightsizing_recommendation

    # 1. Underutilized instance -> Downsize
    rec_down = generate_rightsizing_recommendation(
        resource_id="i-underutilized-01",
        current_type="t3.2xlarge",
        avg_cpu_percent=12.0,
        avg_memory_percent=18.5,
    )
    assert rec_down["action"] == "downsize"
    assert rec_down["confidence"] >= 0.85

    # 2. Overutilized instance -> Upsize
    rec_up = generate_rightsizing_recommendation(
        resource_id="i-bottleneck-02",
        current_type="t3.small",
        avg_cpu_percent=92.0,
        avg_memory_percent=90.0,
    )
    assert rec_up["action"] == "upsize"
    assert rec_up["confidence"] >= 0.80


