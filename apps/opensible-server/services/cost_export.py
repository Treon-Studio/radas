"""Print-friendly and exportable cloud cost report generator (UC607)."""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

from storage import pg
from utils.locale_format import format_currency, format_datetime_locale

logger = logging.getLogger(__name__)


def generate_cost_report(
    project_id: Optional[str] = None,
    format_type: str = "html",
    currency: str = "USD",
    locale: str = "en_US",
) -> str:
    """Generate printable HTML or JSON cost report for stacks in a project (UC607)."""
    pid = project_id or "default"
    rows = pg.query_all(
        "SELECT stack, data FROM stack_meta WHERE project_id = %s ORDER BY stack",
        (pid,),
    )

    stacks_cost: List[Dict[str, Any]] = []
    total_monthly = 0.0

    for r in rows:
        meta = r.get("data") or {}
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}
        cost = float(meta.get("monthly_cost") or meta.get("estimated_monthly_cost") or 0.0)
        provider = meta.get("provider", "generic")
        stacks_cost.append({
            "stack": r["stack"],
            "provider": provider,
            "monthly_cost": cost,
            "formatted_cost": format_currency(cost, currency=currency, locale=locale),
        })
        total_monthly += cost

    payload = {
        "project_id": pid,
        "total_monthly_cost": round(total_monthly, 2),
        "formatted_total_cost": format_currency(total_monthly, currency=currency, locale=locale),
        "currency": currency,
        "stacks": stacks_cost,
        "generated_at": time.time(),
    }

    if format_type.lower() == "json":
        return json.dumps(payload, indent=2)

    table_rows = ""
    for s in stacks_cost:
        table_rows += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{s['stack']}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{s['provider']}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: bold;">{s['formatted_cost']}</td>
        </tr>
        """

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Infrastructure Cost Breakdown - {pid}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #1a202c; }}
        h1 {{ color: #2b6cb0; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }}
        .total-box {{ background: #ebf8ff; border: 1px solid #bee3f8; padding: 15px; border-radius: 8px; font-size: 20px; font-weight: bold; margin: 20px 0; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
        th {{ background: #f7fafc; text-align: left; padding: 12px 10px; border-bottom: 2px solid #cbd5e0; }}
        @media print {{
            body {{ margin: 0; }}
            .no-print {{ display: none; }}
        }}
    </style>
</head>
<body>
    <h1>Infrastructure Cost Breakdown</h1>
    <p><strong>Project:</strong> {pid} | <strong>Report Date:</strong> {format_datetime_locale(time.time(), locale=locale)}</p>
    <div class="total-box">Total Monthly Projected Cost: {format_currency(total_monthly, currency=currency, locale=locale)}</div>
    <table>
        <thead>
            <tr>
                <th>Stack Name</th>
                <th>Provider</th>
                <th>Monthly Estimated Cost</th>
            </tr>
        </thead>
        <tbody>
            {table_rows}
        </tbody>
    </table>
</body>
</html>"""
    return html
