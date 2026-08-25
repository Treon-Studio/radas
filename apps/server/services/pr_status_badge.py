"""Dynamic SVG status badge generator for PRs and repositories (UC506)."""
from __future__ import annotations

from typing import Optional

DEFAULT_COLORS = {
    "passing": "#4c1",
    "passed": "#4c1",
    "success": "#4c1",
    "healthy": "#4c1",
    "failed": "#e05d44",
    "failing": "#e05d44",
    "error": "#e05d44",
    "critical": "#e05d44",
    "running": "#dfb317",
    "pending": "#dfb317",
    "in_progress": "#dfb317",
    "drifted": "#fe7d37",
    "warning": "#fe7d37",
    "unknown": "#9f9f9f",
}


def generate_status_badge_svg(
    label: str,
    status: str,
    color: Optional[str] = None,
) -> str:
    """Generate dynamic Shields.io-compatible SVG badge (UC506)."""
    lbl = str(label or "").strip()
    st = str(status or "").strip()
    badge_color = color or DEFAULT_COLORS.get(st.lower(), "#9f9f9f")

    label_width = max(35, len(lbl) * 7 + 12)
    status_width = max(40, len(st) * 7 + 12)
    total_width = label_width + status_width

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{total_width}" height="20" role="img" aria-label="{lbl}: {st}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="{total_width}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="{label_width}" height="20" fill="#555"/>
    <rect x="{label_width}" width="{status_width}" height="20" fill="{badge_color}"/>
    <rect width="{total_width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="{label_width * 5}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="{(label_width - 10) * 10}">{lbl}</text>
    <text x="{label_width * 5}" y="140" transform="scale(.1)" fill="#fff" textLength="{(label_width - 10) * 10}">{lbl}</text>
    <text aria-hidden="true" x="{(label_width + status_width / 2) * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="{(status_width - 10) * 10}">{st}</text>
    <text x="{(label_width + status_width / 2) * 10}" y="140" transform="scale(.1)" fill="#fff" textLength="{(status_width - 10) * 10}">{st}</text>
  </g>
</svg>"""
