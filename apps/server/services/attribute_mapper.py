"""Template attribute substitution and environment variable mapper (UC353)."""
from __future__ import annotations

import re
from typing import Any, Dict


def _resolve_dotted_key(context: Dict[str, Any], key_path: str) -> Any:
    parts = key_path.split(".")
    curr = context
    for p in parts:
        if isinstance(curr, dict) and p in curr:
            curr = curr[p]
        else:
            return None
    return curr


def expand_template_attributes(template_str: str, context: Dict[str, Any]) -> str:
    """Expand ${path.to.variable} expressions in template strings using provided context (UC353)."""
    if not template_str:
        return ""

    pattern = re.compile(r"\$\{([^}]+)\}")

    def _replacer(match: re.Match) -> str:
        expr = match.group(1).strip()
        val = _resolve_dotted_key(context, expr)
        if val is not None:
            return str(val)
        return match.group(0)

    return pattern.sub(_replacer, template_str)
