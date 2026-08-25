"""
JSON Schema Validation Utility (UC457) — Lightweight request schema validator.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple, Union


def validate_payload_schema(
    data: Any,
    schema: Dict[str, Any],
) -> Tuple[bool, Optional[str]]:
    """Validate a request dictionary against a defined lightweight schema specification.

    Schema format example:
    {
        "required": ["name", "provider"],
        "properties": {
            "name": {"type": "string", "min_length": 1, "max_length": 100},
            "provider": {"type": "string", "enum": ["aws", "gcp", "hetzner"]},
            "count": {"type": "integer", "min": 1, "max": 1000},
            "tags": {"type": "list"},
            "config": {"type": "dict"},
            "enabled": {"type": "boolean"},
        }
    }
    """
    if not isinstance(data, dict):
        return False, "Payload must be a JSON object"

    # 1. Check required fields
    required = schema.get("required") or []
    for req in required:
        if req not in data or data[req] is None:
            return False, f"Missing required field: '{req}'"

    # 2. Check property constraints
    properties = schema.get("properties") or {}
    for prop_name, rules in properties.items():
        if prop_name not in data:
            continue
        val = data[prop_name]
        if val is None:
            continue

        exp_type = rules.get("type")
        if exp_type == "string":
            if not isinstance(val, str):
                return False, f"Field '{prop_name}' must be a string"
            if "min_length" in rules and len(val) < rules["min_length"]:
                return False, f"Field '{prop_name}' length must be >= {rules['min_length']}"
            if "max_length" in rules and len(val) > rules["max_length"]:
                return False, f"Field '{prop_name}' length must be <= {rules['max_length']}"
            if "enum" in rules and val not in rules["enum"]:
                return False, f"Field '{prop_name}' must be one of: {rules['enum']}"
        elif exp_type == "integer":
            if not isinstance(val, int) or isinstance(val, bool):
                return False, f"Field '{prop_name}' must be an integer"
            if "min" in rules and val < rules["min"]:
                return False, f"Field '{prop_name}' must be >= {rules['min']}"
            if "max" in rules and val > rules["max"]:
                return False, f"Field '{prop_name}' must be <= {rules['max']}"
        elif exp_type == "boolean":
            if not isinstance(val, bool):
                return False, f"Field '{prop_name}' must be a boolean"
        elif exp_type == "list":
            if not isinstance(val, list):
                return False, f"Field '{prop_name}' must be a list"
        elif exp_type == "dict":
            if not isinstance(val, dict):
                return False, f"Field '{prop_name}' must be a dictionary object"

    return True, None
