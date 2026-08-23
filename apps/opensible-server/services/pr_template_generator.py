"""Infrastructure Pull Request markdown template generator (UC509)."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def generate_infra_pr_template(
    stack_name: str,
    environment: str,
    changes_summary: str,
) -> str:
    """Generate standardized structured pull request markdown for infrastructure modifications (UC509)."""
    stk = stack_name.strip()
    env = environment.strip()
    summary = changes_summary.strip()

    lines = [
        f"## 🛠️ Infrastructure Change Summary",
        f"- **Stack:** `{stk}`",
        f"- **Environment:** `{env}`",
        f"- **Description:** {summary}",
        "",
        "### 🎯 Blast Radius & Impact",
        "- [ ] No state migration required",
        "- [ ] Zero downtime anticipated",
        "- [ ] Breaking API changes: None",
        "",
        "### 📋 Verification & Testing Checklist",
        "- [ ] `tofu plan` verified with clean output",
        "- [ ] Pre-apply policy gate checks passed",
        "- [ ] Required review approvals obtained",
        "",
        "---",
        "*Automated PR Template provided by RADAS Platform*",
    ]

    return "\n".join(lines)
