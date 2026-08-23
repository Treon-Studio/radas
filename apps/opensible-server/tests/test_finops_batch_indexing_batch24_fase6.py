import pytest


def test_rightsizing_safety_snapshot(pg_db):
    from services.rightsizing_snapshot import execute_safe_rightsizing
    from services.snapshot_comment import get_snapshot_annotation

    res = execute_safe_rightsizing(
        project_id="p-rightsize-test",
        stack="app-backend",
        resource_id="aws_instance.worker_node",
        target_instance_type="t3.medium",
    )
    assert res["success"] is True
    assert res["snapshot_id"].startswith("snap-pre-rightsize-")
    assert res["target_instance_type"] == "t3.medium"

    # Verify annotation was attached
    annotation = get_snapshot_annotation(res["snapshot_id"])
    assert annotation is not None
    assert "rightsizing" in annotation["tags"]


def test_provider_pricing_table_sync(pg_db):
    from services.pricing_table_updater import update_provider_pricing_table, get_instance_price

    # 1. Update AWS pricing table
    rates = {
        "t3.nano": 0.0052,
        "t3.micro": 0.0104,
        "t3.small": 0.0208,
        "t3.medium": 0.0416,
    }
    sync_res = update_provider_pricing_table("aws", rates)
    assert sync_res["success"] is True
    assert sync_res["provider"] == "aws"
    assert sync_res["rates_count"] == 4

    # 2. Retrieve price
    price = get_instance_price("aws", "t3.medium")
    assert price == 0.0416

    # 3. Unknown returns default fallback or 0.0
    assert get_instance_price("aws", "unknown.tier") == 0.0


def test_multi_currency_conversion():
    from services.currency_converter import convert_currency, format_currency

    # 1. Convert $100 USD to IDR
    res_idr = convert_currency(100.0, from_curr="USD", to_curr="IDR")
    assert res_idr["target_amount"] == 1550000.0
    assert res_idr["target_currency"] == "IDR"

    # 2. Convert $100 USD to EUR
    res_eur = convert_currency(100.0, from_curr="USD", to_curr="EUR")
    assert res_eur["target_amount"] == 92.0

    # 3. Currency formatting
    assert format_currency(1234.5, "USD") == "$1,234.50"
    assert format_currency(1500000, "IDR") == "Rp 1,500,000"


def test_resource_cost_breakdown():
    from services.resource_cost_breakdown import categorize_resource_costs

    resources = [
        {"type": "aws_instance", "cost": 120.0},
        {"type": "aws_s3_bucket", "cost": 30.0},
        {"type": "aws_db_instance", "cost": 80.0},
        {"type": "aws_nat_gateway", "cost": 20.0},
    ]

    breakdown = categorize_resource_costs(resources)
    assert breakdown["total_cost"] == 250.0
    assert breakdown["categories"]["Compute"]["cost"] == 120.0
    assert breakdown["categories"]["Storage"]["cost"] == 30.0
    assert breakdown["categories"]["Database"]["cost"] == 80.0
    assert breakdown["categories"]["Networking"]["cost"] == 20.0

