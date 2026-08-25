"""Bidirectional Right-to-Left (RTL) locale and layout direction manager (UC606)."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

RTL_LANG_CODES = {"ar", "he", "fa", "ur", "ps", "yi"}


def resolve_layout_direction(locale: str) -> str:
    """Resolve text and UI direction ('rtl' vs 'ltr') based on ISO locale code (UC606)."""
    clean_locale = locale.strip().lower()
    lang = clean_locale.split("-")[0].split("_")[0]

    if lang in RTL_LANG_CODES:
        return "rtl"
    return "ltr"
