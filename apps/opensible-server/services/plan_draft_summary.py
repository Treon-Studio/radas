"""Template plan draft generator and change summary synthesizer (UC569)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def generate_draft_plan_summary(
    template_data: Dict[str, Any],
    variables: Dict[str, Any],
) -> Dict[str, Any]:
    """Generate estimated execution plan and markdown impact summary from template & input variables (UC569)."""
    tname = template_data.get("name", "Custom Template")
    resources = template_data.get("resources", [])
    outputs = template_data.get("outputs", [])

    resource_names = [r.get("name") for r in resources if r.get("name")]

    md_lines = [
        f"### Draft Plan Summary for '{tname}'",
        f"- **Resources to Create:** {len(resources)}",
        f"- **Configured Outputs:** {len(outputs)}",
        "- **Target Variables:**",
    ]
    for k, v in variables.items():
        md_lines.append(f"  - `{k}`: `{v}`")

    md_lines.append("\n**Planned Resources:**")
    for r in resources:
        md_lines.append(f"- `+ {r.get('type')}.{r.get('name')}`")

    markdown_text = "\n".join(md_lines)

    return {
        "template_name": tname,
        "planned_resources_count": len(resources),
        "resource_names": resource_names,
        "variables": variables,
        "markdown": markdown_text,
    }
