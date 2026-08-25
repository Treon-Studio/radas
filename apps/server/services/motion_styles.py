"""Subtle CSS transition styles respecting reduced-motion accessibility settings (UC590, UC591)."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

TRANSITION_MAP = {
    "fade_in": "transition-opacity duration-200 ease-in-out",
    "slide_down": "transition-transform duration-250 ease-out",
    "scale_up": "transition-transform duration-150 ease-in-out",
    "status_pulse": "transition-colors duration-300 ease-in",
}


def get_transition_class(
    animation_type: str,
    prefers_reduced_motion: bool = False,
) -> str:
    """Return appropriate Tailwind transition class with reduced motion fallback (UC590, UC591)."""
    if prefers_reduced_motion:
        return "transition-none motion-reduce:none"

    return TRANSITION_MAP.get(animation_type, "transition-all duration-200 ease-in-out")
