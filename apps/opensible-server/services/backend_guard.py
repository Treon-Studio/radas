"""Backend configuration editor guard and state key protector (UC522)."""
from __future__ import annotations

import logging
import re
from typing import Any, Dict

logger = logging.getLogger(__name__)


def validate_backend_config_change(
    old_backend: str,
    new_backend: str,
    expected_state_key: str,
) -> Dict[str, Any]:
    """Validate that edits to backend configuration preserve required state keys and backend integrity (UC522)."""
    if not new_backend:
        return {"valid": False, "error": "New backend configuration cannot be empty"}

    # Extract key = "..." from new backend
    key_match = re.search(r'key\s*=\s*"([^"]+)"', new_backend)
    if not key_match:
        return {"valid": False, "error": "Missing 'key' attribute in backend configuration"}

    found_key = key_match.group(1).strip()
    if expected_state_key and found_key != expected_state_key.strip():
        logger.warning(
            f"Backend guard blocked invalid key change: expected '{expected_state_key}', found '{found_key}'"
        )
        return {
            "valid": False,
            "error": f"State key mismatch. Expected '{expected_state_key}', but found '{found_key}'",
            "found_key": found_key,
            "expected_key": expected_state_key,
        }

    return {"valid": True, "state_key": found_key}
