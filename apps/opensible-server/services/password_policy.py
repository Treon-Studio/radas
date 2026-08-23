"""Per-organization password complexity policy manager (UC626)."""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, Optional, Tuple

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

KV_SCOPE = "password_policy"

DEFAULT_POLICY = {
    "min_length": 8,
    "require_uppercase": True,
    "require_numbers": True,
    "require_special": False,
}


def get_org_password_policy(org_id: Optional[str] = None) -> Dict[str, Any]:
    """Retrieve password complexity policy for an organization or default."""
    target_key = (org_id or "").strip() or "default"
    policy = kv_get(KV_SCOPE, target_key)
    if policy and isinstance(policy, dict):
        return {**DEFAULT_POLICY, **policy}

    global_default = kv_get(KV_SCOPE, "default")
    if global_default and isinstance(global_default, dict):
        return {**DEFAULT_POLICY, **global_default}

    return dict(DEFAULT_POLICY)


def set_org_password_policy(
    org_id: str,
    min_length: int = 8,
    require_uppercase: bool = True,
    require_numbers: bool = True,
    require_special: bool = False,
) -> None:
    """Configure password complexity rules for an organization."""
    target_key = (org_id or "").strip() or "default"
    payload = {
        "min_length": max(6, int(min_length)),
        "require_uppercase": bool(require_uppercase),
        "require_numbers": bool(require_numbers),
        "require_special": bool(require_special),
    }
    kv_set(KV_SCOPE, target_key, payload)
    logger.info(f"Updated password policy for org '{target_key}': {payload}")


def validate_password_for_org(password: str, org_id: Optional[str] = None) -> Tuple[bool, Optional[str]]:
    """Validate a password candidate against an org's policy rules."""
    policy = get_org_password_policy(org_id)
    pwd = password or ""

    min_len = policy.get("min_length", 8)
    if len(pwd) < min_len:
        return False, f"Password must be at least {min_len} characters long."

    if policy.get("require_uppercase") and not any(c.isupper() for c in pwd):
        return False, "Password must contain at least one uppercase letter."

    if policy.get("require_numbers") and not any(c.isdigit() for c in pwd):
        return False, "Password must contain at least one number."

    if policy.get("require_special") and not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\/`~]", pwd):
        return False, "Password must contain at least one special character."

    return True, None
