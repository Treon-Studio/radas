"""Branch-to-environment mapping for VCS-driven workspaces (UC339).

Stores mapping rules per stack in stack_meta (JSON). Each rule defines a branch
pattern (regex) and the target environment (dev/staging/prod) and optional
stack override.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, List, Optional

from psycopg.types.json import Jsonb

from storage import pg


def get_mapping(project_id: str, stack: str) -> List[Dict[str, Any]]:
    """Return the branch mapping rules for a stack."""
    row = pg.query_one(
        "SELECT data FROM stack_meta WHERE project_id = %s AND stack = %s",
        (project_id, stack),
    )
    if not row:
        return []
    meta = row.get("data") or {}
    return meta.get("branch_mapping") or []


def set_mapping(project_id: str, stack: str, rules: List[Dict[str, Any]]) -> None:
    """Replace the branch mapping rules for a stack."""
    # Validate rules
    for rule in rules:
        pattern = rule.get("pattern")
        if not pattern:
            raise ValueError("Each rule must have a 'pattern' (regex)")
        try:
            re.compile(pattern)
        except re.error as e:
            raise ValueError(f"Invalid regex pattern: {e}")
        env = rule.get("environment")
        if env not in ("dev", "staging", "prod", "preview", "test"):
            raise ValueError(f"Invalid environment: {env}. Must be dev, staging, prod, preview, or test")
        # stack_override is optional; if omitted, uses the stack's own name
        if "stack_override" in rule and not isinstance(rule["stack_override"], str):
            raise ValueError("stack_override must be a string")

    # Update stack_meta
    row = pg.query_one(
        "SELECT data FROM stack_meta WHERE project_id = %s AND stack = %s",
        (project_id, stack),
    )
    meta = dict(row.get("data") or {}) if row else {}
    meta["branch_mapping"] = rules
    meta["branch_mapping_updated_at"] = int(time.time())

    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s) "
        "ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data",
        (project_id, stack, json.dumps(meta)),
    )


def resolve_environment(project_id: str, stack: str, branch: str) -> Dict[str, Any]:
    """Resolve the target environment and optional stack override for a given branch."""
    rules = get_mapping(project_id, stack)
    for rule in rules:
        pattern = rule.get("pattern")
        if re.search(pattern, branch):
            return {
                "environment": rule.get("environment", "dev"),
                "stack_override": rule.get("stack_override"),
                "matched_rule": rule,
            }
    # Default fallback: treat as dev if no rule matches
    return {"environment": "dev", "stack_override": None, "matched_rule": None}