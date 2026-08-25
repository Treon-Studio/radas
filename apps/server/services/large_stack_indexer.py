"""High-performance large stack list pagination and search filtering engine (UC564)."""
from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def paginate_large_stack_list(
    stacks: List[Dict[str, Any]],
    page: int = 1,
    page_size: int = 50,
    filter_query: Optional[str] = None,
) -> Dict[str, Any]:
    """Paginate and filter a large collection of infrastructure stacks (>500 items) (UC564)."""
    clean_page = max(1, int(page))
    clean_size = max(1, min(200, int(page_size)))

    filtered_stacks = stacks
    if filter_query:
        query_norm = filter_query.strip().lower()
        filtered_stacks = [
            s for s in stacks
            if query_norm in str(s.get("name", "")).lower() or query_norm in str(s.get("id", "")).lower() or query_norm in str(s.get("env", "")).lower()
        ]

    total_items = len(filtered_stacks)
    total_pages = max(1, math.ceil(total_items / clean_size))

    start_idx = (clean_page - 1) * clean_size
    end_idx = start_idx + clean_size
    items = filtered_stacks[start_idx:end_idx]

    logger.info(f"Paginated large stack query (total={total_items}, page={clean_page}/{total_pages})")

    return {
        "items": items,
        "total_items": total_items,
        "page": clean_page,
        "page_size": clean_size,
        "total_pages": total_pages,
        "has_next": clean_page < total_pages,
        "has_prev": clean_page > 1,
    }
