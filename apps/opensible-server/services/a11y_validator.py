"""Accessibility and WCAG AAA color contrast ratio validator (UC588, UC589)."""
from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


def _hex_to_rgb(hex_code: str) -> tuple[int, int, int]:
    clean = hex_code.strip().lstrip("#")
    if len(clean) == 3:
        clean = "".join(c * 2 for c in clean)
    return int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16)


def _relative_luminance(rgb: tuple[int, int, int]) -> float:
    def channel_lum(val: int) -> float:
        c = val / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * channel_lum(r) + 0.7152 * channel_lum(g) + 0.0722 * channel_lum(b)


def calculate_contrast_ratio(
    foreground_hex: str,
    background_hex: str,
) -> Dict[str, Any]:
    """Calculate WCAG 2.1 contrast ratio and check AA/AAA thresholds (UC588, UC589)."""
    fg_rgb = _hex_to_rgb(foreground_hex)
    bg_rgb = _hex_to_rgb(background_hex)

    l1 = _relative_luminance(fg_rgb)
    l2 = _relative_luminance(bg_rgb)

    lum_max = max(l1, l2)
    lum_min = min(l1, l2)
    ratio = round((lum_max + 0.05) / (lum_min + 0.05), 2)

    return {
        "foreground": foreground_hex,
        "background": background_hex,
        "contrast_ratio": ratio,
        "wcag_aa_normal": ratio >= 4.5,
        "wcag_aa_large": ratio >= 3.0,
        "wcag_aaa_normal": ratio >= 7.0,
        "wcag_aaa_large": ratio >= 4.5,
    }
