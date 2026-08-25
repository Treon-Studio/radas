"""
Prometheus Metrics Exporter (UC464) — System and API telemetry metrics generator.
"""
from __future__ import annotations

import time
from typing import Dict, Any


def generate_prometheus_metrics() -> str:
    """Generate Prometheus exposition format text metrics (UC464)."""
    lines = [
        "# HELP radas_server_up Server operational status",
        "# TYPE radas_server_up gauge",
        "radas_server_up 1",
        "",
        "# HELP radas_server_uptime_seconds Server uptime in seconds",
        "# TYPE radas_server_uptime_seconds counter",
        f"radas_server_uptime_seconds {int(time.time())}",
        "",
    ]

    # Stacks / Provisioning counts
    try:
        from storage import pg
        stack_count_row = pg.query_one("SELECT COUNT(*) AS c FROM stack_meta")
        stack_count = stack_count_row.get("c", 0) if stack_count_row else 0
    except Exception:
        stack_count = 0

    lines.extend([
        "# HELP radas_provisioning_stacks_total Total managed infrastructure stacks",
        "# TYPE radas_provisioning_stacks_total gauge",
        f"radas_provisioning_stacks_total {stack_count}",
        "",
    ])

    # BYOC accounts count
    try:
        from services import byoc
        accounts = byoc.list_accounts()
        byoc_count = len(accounts)
    except Exception:
        byoc_count = 0

    lines.extend([
        "# HELP radas_byoc_connected_accounts_total Connected cloud provider accounts",
        "# TYPE radas_byoc_connected_accounts_total gauge",
        f"radas_byoc_connected_accounts_total {byoc_count}",
        "",
    ])

    # Feature flags count
    try:
        from services import feature_flag_registry
        flags = feature_flag_registry.list_flags()
        flag_count = len(flags)
    except Exception:
        flag_count = 0

    lines.extend([
        "# HELP radas_feature_flags_total Total registered feature flags",
        "# TYPE radas_feature_flags_total gauge",
        f"radas_feature_flags_total {flag_count}",
        "",
    ])

    return "\n".join(lines) + "\n"
