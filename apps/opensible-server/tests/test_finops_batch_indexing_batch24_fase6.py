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


def test_search_inverted_indexing(pg_db):
    from services.search_indexer import index_document, search_indexed_documents

    # 1. Index documents
    index_document(
        doc_id="stack-prod-vpc",
        doc_type="stack",
        text_content="Production VPC with multi-AZ subnet routing and NAT gateways",
        metadata={"project_id": "p-core", "env": "prod"},
    )
    index_document(
        doc_id="stack-stage-db",
        doc_type="stack",
        text_content="Staging PostgreSQL RDS instance with automated daily backup",
        metadata={"project_id": "p-core", "env": "stage"},
    )

    # 2. Search for "PostgreSQL"
    results_db = search_indexed_documents("postgresql")
    assert len(results_db) >= 1
    assert results_db[0]["doc_id"] == "stack-stage-db"

    # 3. Search for "VPC routing"
    results_vpc = search_indexed_documents("vpc routing")
    assert len(results_vpc) >= 1
    assert results_vpc[0]["doc_id"] == "stack-prod-vpc"


def test_batch_run_operations(pg_db):
    from services.batch_operations import execute_batch_run_operation

    execution_ids = ["exec-batch-101", "exec-batch-102", "exec-batch-103"]

    # 1. Batch retry
    res_retry = execute_batch_run_operation(execution_ids, action="retry", actor="dev-alice")
    assert res_retry["success"] is True
    assert res_retry["action"] == "retry"
    assert res_retry["processed_count"] == 3
    assert len(res_retry["success_ids"]) == 3

    # 2. Batch cancel
    res_cancel = execute_batch_run_operation(["exec-batch-101"], action="cancel", actor="admin-bob")
    assert res_cancel["processed_count"] == 1


def test_draft_plan_summary_generation():
    from services.plan_draft_summary import generate_draft_plan_summary

    template = {
        "name": "Standard Web App",
        "resources": [
            {"name": "web_server", "type": "aws_instance"},
            {"name": "static_assets", "type": "aws_s3_bucket"},
            {"name": "app_db", "type": "aws_db_instance"},
        ],
        "outputs": ["public_ip", "bucket_name"],
    }
    variables = {"instance_type": "t3.small", "environment": "production"}

    summary = generate_draft_plan_summary(template, variables)
    assert summary["planned_resources_count"] == 3
    assert "web_server" in summary["resource_names"]
    assert "Plan Summary for 'Standard Web App'" in summary["markdown"]
    assert "production" in summary["markdown"]


def test_visual_snapshot_comparison():
    from services.visual_snapshot import compare_visual_snapshots

    ref = {
        "component": "CostChart",
        "checksum": "abc123sha",
        "elements": {"header": {"color": "#111", "fontSize": "16px"}, "bars": 12},
    }
    curr_same = {
        "component": "CostChart",
        "checksum": "abc123sha",
        "elements": {"header": {"color": "#111", "fontSize": "16px"}, "bars": 12},
    }
    curr_diff = {
        "component": "CostChart",
        "checksum": "xyz999sha",
        "elements": {"header": {"color": "#222", "fontSize": "18px"}, "bars": 12},
    }

    # 1. Same matches
    res_same = compare_visual_snapshots(ref, curr_same)
    assert res_same["match"] is True
    assert res_same["diff_count"] == 0

    # 2. Changed triggers diff
    res_diff = compare_visual_snapshots(ref, curr_diff)
    assert res_diff["match"] is False
    assert res_diff["diff_count"] >= 1



