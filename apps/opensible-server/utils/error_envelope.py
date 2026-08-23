"""Uniform API error response envelope builder (UC461)."""
from __future__ import annotations

import time
from typing import Any, Dict, Optional


def make_error_envelope(
    error_code: str,
    message: str,
    status_code: int = 400,
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Format uniform error payload for all REST API endpoints (UC461)."""
    return {
        "error": error_code.strip(),
        "message": message.strip(),
        "status_code": status_code,
        "details": details or {},
        "timestamp": time.time(),
    }
