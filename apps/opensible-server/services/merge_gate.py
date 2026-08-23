"""Multi-check pull request merge gate evaluator (UC505)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

VALID_SUCCESS_STATUSES = {"success", "passed", "skipped"}


def evaluate_merge_gate(
    required_checks: List[str],
    check_results: Dict[str, str],
) -> Dict[str, Any]:
    """Evaluate if all mandatory automated status checks have successfully concluded (UC505)."""
    clean_required = [c.strip() for c in required_checks if c.strip()]
    missing_checks: List[str] = []
    failed_checks: List[str] = []
    passed_count = 0

    for req in clean_required:
        if req not in check_results:
            missing_checks.append(req)
        else:
            status = str(check_results[req]).lower().strip()
            if status in VALID_SUCCESS_STATUSES:
                passed_count += 1
            else:
                failed_checks.append(req)

    can_merge = (len(missing_checks) == 0) and (len(failed_checks) == 0)

    logger.info(f"Evaluated merge gate for {len(clean_required)} checks: can_merge={can_merge}")

    return {
        "can_merge": can_merge,
        "total_required": len(clean_required),
        "passed_count": passed_count,
        "failed_count": len(failed_checks) + len(missing_checks),
        "missing_checks": missing_checks,
        "failed_checks": failed_checks,
    }
