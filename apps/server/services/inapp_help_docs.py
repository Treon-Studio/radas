"""Context-sensitive in-app help drawer documentation resolver (UC599)."""
from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)

HELP_CATALOG = {
    "/flags": {
        "title": "Feature Flags Management",
        "articles": [
            {"title": "Targeting Rules", "summary": "Configure user and percentage rollout rules."},
            {"title": "Kill Switches", "summary": "Emergency circuit breakers to disable flags instantaneously."},
        ],
    },
    "/stacks": {
        "title": "Infrastructure Stacks",
        "articles": [
            {"title": "Running Plans", "summary": "How to preview speculative tofu changes before apply."},
            {"title": "Drift Detection", "summary": "Automated reconciliation of out-of-band changes."},
        ],
    },
    "/cost": {
        "title": "FinOps & Cost Attribution",
        "articles": [
            {"title": "Budgets & Alerts", "summary": "Setting anomaly thresholds and monthly spending caps."},
        ],
    },
}


def get_help_doc_for_route(route_path: str) -> Dict[str, Any]:
    """Retrieve relevant documentation articles for the given application route (UC599)."""
    clean_route = route_path.strip().rstrip("/")

    for key, val in HELP_CATALOG.items():
        if clean_route.startswith(key):
            return {"route": clean_route, **val}

    return {
        "route": clean_route,
        "title": "RADAS Documentation & Knowledge Base",
        "articles": [
            {"title": "Getting Started", "summary": "Platform overview and CLI quickstart guide."},
            {"title": "API Reference", "summary": "Complete REST API endpoints and SDK documentation."},
        ],
    }
