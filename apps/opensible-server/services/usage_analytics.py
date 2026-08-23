"""Product usage metrics and DAU stack analytics (UC602)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict

from storage import pg

logger = logging.getLogger(__name__)


def get_product_usage_metrics(days: int = 30) -> Dict[str, Any]:
    """Aggregate product usage statistics across stacks, runs, and users (UC602)."""
    total_stacks_res = pg.query_one("SELECT COUNT(*) as count FROM stack_meta")
    total_stacks = total_stacks_res.get("count", 0) if total_stacks_res else 0

    users_res = pg.query_one("SELECT COUNT(*) as count FROM users WHERE is_active = 1")
    total_users = users_res.get("count", 0) if users_res else 0

    cutoff = time.time() - (days * 86400)
    cutoff_24h = time.time() - 86400

    try:
        active_stacks_res = pg.query_one(
            "SELECT COUNT(DISTINCT target_id) as count FROM audit_log WHERE target_type = 'stack' AND created_at >= %s",
            (time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(cutoff)),),
        )
        active_stacks_30d = active_stacks_res.get("count", 0) if active_stacks_res else 0

        dau_res = pg.query_one(
            "SELECT COUNT(DISTINCT target_id) as count FROM audit_log WHERE target_type = 'stack' AND created_at >= %s",
            (time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(cutoff_24h)),),
        )
        dau_stacks_24h = dau_res.get("count", 0) if dau_res else 0
    except Exception:
        active_stacks_30d = 0
        dau_stacks_24h = 0

    return {
        "period_days": days,
        "total_stacks": total_stacks,
        "total_users": total_users,
        "active_stacks_30d": active_stacks_30d,
        "dau_stacks_24h": dau_stacks_24h,
        "generated_at": time.time(),
    }
