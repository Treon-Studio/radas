"""Interactive playbook survey schema validator and prompt generator (UC380)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def validate_playbook_survey_inputs(
    survey_spec: Dict[str, Any],
    user_inputs: Dict[str, Any],
) -> Dict[str, Any]:
    """Validate user provided parameters against playbook survey spec schema (UC380)."""
    fields: List[Dict[str, Any]] = survey_spec.get("fields", [])
    errors: List[str] = []
    sanitized: Dict[str, Any] = {}

    for f in fields:
        name = f.get("name")
        if not name:
            continue

        f_type = f.get("type", "string")
        required = f.get("required", False)
        val = user_inputs.get(name)

        if val is None or (isinstance(val, str) and not val.strip()):
            if required:
                errors.append(f"Field '{name}' is required")
            continue

        # Type conversion & validation
        if f_type == "integer":
            try:
                num = int(val)
                min_v = f.get("min")
                max_v = f.get("max")
                if min_v is not None and num < min_v:
                    errors.append(f"Field '{name}' value {num} is less than minimum {min_v}")
                elif max_v is not None and num > max_v:
                    errors.append(f"Field '{name}' value {num} exceeds maximum {max_v}")
                else:
                    sanitized[name] = num
            except (ValueError, TypeError):
                errors.append(f"Field '{name}' must be an integer")
        elif f_type == "choice":
            choices = f.get("choices", [])
            val_str = str(val).strip()
            if choices and val_str not in choices:
                errors.append(f"Field '{name}' value '{val_str}' is not in allowed choices: {choices}")
            else:
                sanitized[name] = val_str
        elif f_type == "boolean":
            if isinstance(val, bool):
                sanitized[name] = val
            elif str(val).lower() in ("true", "1", "yes"):
                sanitized[name] = True
            elif str(val).lower() in ("false", "0", "no"):
                sanitized[name] = False
            else:
                errors.append(f"Field '{name}' must be a boolean")
        else:
            sanitized[name] = str(val).strip()

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "sanitized_inputs": sanitized,
    }
