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
