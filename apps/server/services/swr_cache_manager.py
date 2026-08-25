"""Stale-While-Revalidate (SWR) cache header and ETag manager (UC579)."""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


def generate_swr_headers(
    resource_data: Any,
    max_age_sec: int = 60,
    stale_sec: int = 300,
) -> Dict[str, str]:
    """Generate HTTP Cache-Control and ETag headers for client-side SWR caching (UC579)."""
    clean_max = max(0, int(max_age_sec))
    clean_stale = max(0, int(stale_sec))

    # Serialize deterministically for ETag computation
    data_str = json.dumps(resource_data, sort_keys=True, default=str)
    etag_hash = hashlib.sha256(data_str.encode("utf-8")).hexdigest()[:16]

    headers = {
        "Cache-Control": f"public, max-age={clean_max}, stale-while-revalidate={clean_stale}",
        "ETag": f'W/"{etag_hash}"',
    }

    logger.info(f"Generated SWR headers: max-age={clean_max}, stale={clean_stale}, etag={headers['ETag']}")
    return headers
