"""Vite frontend bundle chunk size budget validator and lazy-loading split analyzer (UC577, UC578)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def validate_bundle_budgets(
    chunks: Dict[str, int],
    max_chunk_kb: int = 500,
) -> Dict[str, Any]:
    """Analyze chunk sizes against bundle budget and identify lazy-load candidates (UC577, UC578)."""
    oversized_chunks: List[str] = []
    lazy_load_candidates: List[str] = []
    total_kb = 0

    for name, size_kb in chunks.items():
        total_kb += int(size_kb)
        if size_kb > max_chunk_kb:
            oversized_chunks.append(name)
            if any(k in name.lower() for k in ["chart", "editor", "monaco", "graph", "wizard"]):
                lazy_load_candidates.append(name)

    within_budget = len(oversized_chunks) == 0

    logger.info(f"Validated bundle budgets: total={total_kb}KB, within_budget={within_budget}, oversized={len(oversized_chunks)}")

    return {
        "within_budget": within_budget,
        "total_bundle_kb": total_kb,
        "max_chunk_kb": max_chunk_kb,
        "oversized_chunks": oversized_chunks,
        "lazy_load_candidates": lazy_load_candidates,
    }
