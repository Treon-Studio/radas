"""Audit logger for infrastructure resource lifecycle operations and feature flags (UC496)."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from services.audit_events import record_audit_event

logger = logging.getLogger(__name__)


def audit_resource_action(
    action: str,
    resource_type: str,
    resource_id: str,
    actor: str = "system",
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Emit and persist structured audit record for resource import, flag mutation, or deletion (UC496)."""
    record_audit_event(
        action=action.strip(),
        actor_user_id=actor.strip(),
        target_type=resource_type.strip(),
        target_id=resource_id.strip(),
        meta=details or {},
    )
    logger.info(f"Audited {action} on {resource_type}:{resource_id} by {actor}")

    return {
        "success": True,
        "action": action.strip(),
        "resource_type": resource_type.strip(),
        "resource_id": resource_id.strip(),
        "actor": actor.strip(),
        "details": details or {},
    }
