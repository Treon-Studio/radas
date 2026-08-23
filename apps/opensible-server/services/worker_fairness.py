"""Worker task dispatch round-robin fairness scheduler (UC479)."""
from __future__ import annotations

import collections
import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def schedule_fair_round_robin(queued_tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Interleave queued jobs by stack / partition in round-robin order to guarantee fairness (UC479)."""
    if not queued_tasks:
        return []

    # Group by stack (preserving task order within stack)
    stack_queues: Dict[str, collections.deque] = collections.defaultdict(collections.deque)
    distinct_stacks: List[str] = []

    for t in queued_tasks:
        stk = str(t.get("stack") or t.get("project_id") or "default")
        if stk not in stack_queues:
            distinct_stacks.append(stk)
        stack_queues[stk].append(t)

    scheduled: List[Dict[str, Any]] = []
    has_remaining = True

    while has_remaining:
        has_remaining = False
        for stk in distinct_stacks:
            q = stack_queues[stk]
            if q:
                scheduled.append(q.popleft())
                if q:
                    has_remaining = True

    logger.info(f"Fairness scheduler interleaved {len(queued_tasks)} tasks across {len(distinct_stacks)} stacks")
    return scheduled
