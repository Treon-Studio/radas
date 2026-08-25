"""Conventional Commits standard message validator (UC433)."""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

CONVENTIONAL_PATTERN = re.compile(
    r"^(?P<type>feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)"
    r"(?:\((?P<scope>[a-zA-Z0-9_\-\.\/]+)\))?"
    r"(?P<breaking>!)?:\s+(?P<subject>.+)$"
)


def validate_conventional_commit(message: str) -> Dict[str, Any]:
    """Validate whether commit message conforms to Conventional Commits standard (UC433)."""
    if not message or not isinstance(message, str):
        return {"valid": False, "error": "Commit message cannot be empty"}

    first_line = message.strip().splitlines()[0].strip()
    match = CONVENTIONAL_PATTERN.match(first_line)

    if not match:
        return {
            "valid": False,
            "error": "Message does not match Conventional Commits format '<type>(<scope>): <subject>'",
            "message": first_line,
        }

    data = match.groupdict()
    return {
        "valid": True,
        "type": data.get("type"),
        "scope": data.get("scope"),
        "breaking": bool(data.get("breaking")),
        "subject": data.get("subject"),
        "header": first_line,
    }
