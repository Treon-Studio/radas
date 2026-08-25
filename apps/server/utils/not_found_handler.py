"""Semantic 404 Not Found error responses and context builder (UC460)."""
from __future__ import annotations

from typing import Any, Dict, Optional


def format_not_found_response(
    entity_type: str,
    entity_id: str,
    context: Optional[str] = None,
) -> Dict[str, Any]:
    """Produce standardized semantic 404 Not Found structure with diagnostic context (UC460)."""
    etype = entity_type.strip()
    eid = entity_id.strip()
    msg = f"{etype.capitalize()} '{eid}' was not found"
    if context:
        msg += f" ({context.strip()})"

    return {
        "error": "not_found",
        "status_code": 404,
        "entity_type": etype,
        "entity_id": eid,
        "message": msg,
    }
