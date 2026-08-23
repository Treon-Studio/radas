"""Command palette action index and keyboard shortcut manager (UC594, UC595)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

COMMAND_CATALOG = [
    {"id": "cmd-focus-search", "title": "Focus Search", "category": "Navigation", "shortcut": "/", "action": "focus_search"},
    {"id": "cmd-palette", "title": "Open Command Palette", "category": "General", "shortcut": "Cmd+K", "action": "open_palette"},
    {"id": "cmd-goto-stacks", "title": "Go to Stacks", "category": "Navigation", "shortcut": "g s", "action": "navigate_stacks"},
    {"id": "cmd-goto-projects", "title": "Go to Projects", "category": "Navigation", "shortcut": "g p", "action": "navigate_projects"},
    {"id": "cmd-new-stack", "title": "Create New Stack", "category": "Action", "shortcut": "c s", "action": "open_create_stack_modal"},
    {"id": "cmd-toggle-theme", "title": "Toggle Dark/Light Theme", "category": "Preferences", "shortcut": "t t", "action": "toggle_theme"},
]


def search_command_palette(query: str = "") -> List[Dict[str, Any]]:
    """Filter command palette items by title, shortcut, or category (UC594, UC595)."""
    q_norm = query.strip().lower()
    if not q_norm:
        return list(COMMAND_CATALOG)

    return [
        cmd for cmd in COMMAND_CATALOG
        if q_norm in cmd["title"].lower() or q_norm in cmd["category"].lower() or q_norm in cmd.get("shortcut", "").lower()
    ]
