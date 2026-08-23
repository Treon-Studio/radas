"""Exponential backoff calculator for concurrent worker claim conflicts (UC478)."""
from __future__ import annotations

import logging
import random

logger = logging.getLogger(__name__)


def calculate_claim_backoff(
    attempt: int,
    base_delay: float = 0.5,
    max_delay: float = 10.0,
    jitter: bool = False,
) -> float:
    """Calculate exponential backoff delay to resolve concurrency race conditions in job claims (UC478)."""
    att = max(1, int(attempt))
    delay = min(float(max_delay), float(base_delay) * (2 ** (att - 1)))

    if jitter:
        delay = random.uniform(base_delay, delay)

    return round(delay, 2)
