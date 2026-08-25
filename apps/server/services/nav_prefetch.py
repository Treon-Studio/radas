"""Navigation hover prefetch routing predictor (UC580)."""
from __future__ import annotations

import logging
from typing import List

logger = logging.getLogger(__name__)


def get_prefetch_routes(current_path: str) -> List[str]:
    """Determine subroutes to prefetch in background when user navigates or hovers (UC580)."""
    clean_path = current_path.strip().rstrip("/")
    if not clean_path:
        return ["/projects", "/activity"]

    if clean_path.startswith("/stacks/"):
        return [
            f"{clean_path}/runs",
            f"{clean_path}/settings",
            f"{clean_path}/resources",
            f"{clean_path}/cost",
        ]
    elif clean_path.startswith("/projects/"):
        return [
            f"{clean_path}/stacks",
            f"{clean_path}/audit",
            f"{clean_path}/settings",
        ]
    return [f"{clean_path}/details"]
