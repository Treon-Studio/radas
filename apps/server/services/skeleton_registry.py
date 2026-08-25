"""Consistent card and table data loading skeleton schema generator (UC592)."""
from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


def get_skeleton_schema(card_type: str) -> Dict[str, Any]:
    """Retrieve UI loading skeleton wireframe schema for component cards (UC592)."""
    ctype = card_type.strip().lower()

    if ctype == "stack_card":
        return {
            "type": "stack_card",
            "blocks": [
                {"element": "header", "width": "60%", "height": "20px"},
                {"element": "badge", "width": "25%", "height": "16px"},
                {"element": "body", "width": "100%", "height": "40px"},
                {"element": "footer", "width": "40%", "height": "14px"},
            ],
            "shimmer": True,
        }
    elif ctype == "metric_card":
        return {
            "type": "metric_card",
            "blocks": [
                {"element": "title", "width": "50%", "height": "16px"},
                {"element": "value", "width": "75%", "height": "32px"},
                {"element": "trend", "width": "30%", "height": "14px"},
            ],
            "shimmer": True,
        }

    return {
        "type": ctype,
        "blocks": [
            {"element": "line", "width": "100%", "height": "18px"},
            {"element": "line", "width": "80%", "height": "18px"},
        ],
        "shimmer": True,
    }
