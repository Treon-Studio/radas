"""Structured JSON log message formatter (UC462)."""
from __future__ import annotations

import json
import time
from typing import Any, Dict, Optional


def format_structured_log(
    event_type: str,
    message: str,
    level: str = "INFO",
    context: Optional[Dict[str, Any]] = None,
) -> str:
    """Format log events as single-line JSON string for ingestion (UC462)."""
    entry = {
        "timestamp": time.time(),
        "level": level.upper().strip(),
        "event_type": event_type.strip(),
        "message": message.strip(),
        "context": context or {},
    }
    return json.dumps(entry)
