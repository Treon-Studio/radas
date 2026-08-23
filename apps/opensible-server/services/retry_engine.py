"""Exponential backoff retry engine with randomized jitter (UC583)."""
from __future__ import annotations

import logging
import random
import time
from typing import Any, Callable, Tuple, Type

logger = logging.getLogger(__name__)


def retry_with_jitter(
    fn: Callable[[], Any],
    max_retries: int = 3,
    base_delay: float = 0.05,
    max_delay: float = 2.0,
    exceptions: Tuple[Type[BaseException], ...] = (Exception,),
) -> Any:
    """Execute a callable with exponential backoff and randomized jitter (UC583)."""
    attempt = 0
    while True:
        try:
            return fn()
        except exceptions as e:
            attempt += 1
            if attempt >= max_retries:
                logger.error(f"Operation failed after {attempt} attempts: {e}")
                raise

            delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
            jitter = random.uniform(0, base_delay)
            total_sleep = delay + jitter

            logger.warning(
                f"Attempt {attempt}/{max_retries} failed with {type(e).__name__}: {e}. Retrying in {total_sleep:.3f}s..."
            )
            time.sleep(total_sleep)
