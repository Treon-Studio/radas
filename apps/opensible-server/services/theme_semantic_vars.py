"""Semantic design token CSS variable mapper (UC585)."""
from __future__ import annotations

import logging
from typing import Dict

logger = logging.getLogger(__name__)


def get_semantic_theme_tokens(theme: str = "dark") -> Dict[str, str]:
    """Retrieve theme-specific semantic CSS variables (UC585)."""
    is_dark = theme.lower().strip() == "dark"
    if is_dark:
        return {
            "--color-bg-base": "#0a0c10",
            "--color-bg-card": "#161b22",
            "--color-text-primary": "#f0f6fc",
            "--color-text-secondary": "#8b949e",
            "--color-success": "#238636",
            "--color-danger": "#da3633",
            "--color-warning": "#d29922",
            "--color-info": "#58a6ff",
            "--focus-ring": "0 0 0 2px #58a6ff",
        }
    return {
        "--color-bg-base": "#ffffff",
        "--color-bg-card": "#f6f8fa",
        "--color-text-primary": "#1f2328",
        "--color-text-secondary": "#656d76",
        "--color-success": "#1a7f37",
        "--color-danger": "#cf222e",
        "--color-warning": "#9a6700",
        "--color-info": "#0969da",
        "--focus-ring": "0 0 0 2px #0969da",
    }
