"""Granular stack cost categorization and resource-type spend breakdown (UC562)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

CATEGORY_MAP = {
    "compute": {"aws_instance", "google_compute_instance", "azurerm_linux_virtual_machine", "aws_ecs_task_definition", "aws_lambda_function"},
    "storage": {"aws_s3_bucket", "aws_ebs_volume", "google_storage_bucket", "azurerm_storage_account"},
    "database": {"aws_db_instance", "aws_rds_cluster", "google_sql_database_instance", "aws_dynamodb_table"},
    "networking": {"aws_lb", "aws_alb", "aws_nat_gateway", "aws_route53_zone", "aws_vpc", "aws_security_group"},
}


def categorize_resource_costs(resources: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Classify and aggregate resource costs by infrastructure functional category (UC562)."""
    categories: Dict[str, Dict[str, Any]] = {
        "Compute": {"cost": 0.0, "count": 0},
        "Storage": {"cost": 0.0, "count": 0},
        "Database": {"cost": 0.0, "count": 0},
        "Networking": {"cost": 0.0, "count": 0},
        "Other": {"cost": 0.0, "count": 0},
    }

    total_cost = 0.0

    for r in resources:
        rtype = str(r.get("type") or "").lower().strip()
        cost = float(r.get("cost") or 0.0)
        total_cost += cost

        matched = False
        for cat_name, rtypes in CATEGORY_MAP.items():
            if rtype in rtypes:
                cat_key = cat_name.capitalize()
                categories[cat_key]["cost"] += cost
                categories[cat_key]["count"] += 1
                matched = True
                break

        if not matched:
            categories["Other"]["cost"] += cost
            categories["Other"]["count"] += 1

    # Round costs and calculate percentages
    for cat_data in categories.values():
        cat_data["cost"] = round(cat_data["cost"], 2)
        cat_data["percentage"] = round((cat_data["cost"] / total_cost * 100.0) if total_cost > 0 else 0.0, 1)

    logger.info(f"Categorized {len(resources)} resources totaling ${total_cost:.2f}")

    return {
        "total_cost": round(total_cost, 2),
        "resource_count": len(resources),
        "categories": categories,
    }
