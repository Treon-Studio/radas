"""
Global audit event service (Fase 2 — UC341).

Provides a safe, reusable integration layer over storage.auth_db.audit for
recording append-only audit trails across the system. Handles data directory
resolution, metadata redaction, and best-effort write semantics.

Usage:
    from services.audit_events import record_audit_event

    record_audit_event(
        "cloud.run.queued",
        actor_user_id=current_user["user_id"],
        target_type="execution",
        target_id=execution_id,
        meta={
            "project_id": project_id,
            "stack_name": stack_name,
            "tofu_action": action,
            "provider": provider,
            "triggered_by": triggered_by,
            "worker_id": worker_id,
            "actor_kind": "user",
        },
    )
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Optional, Mapping

from app_context import get_data_dir
from api.platform_contracts import redact_sensitive

logger = logging.getLogger(__name__)

def record_audit_event(
    action: str,
    *,
    actor_user_id: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    meta: Optional[Mapping[str, Any]] = None,
) -> None:
    """
    Record an audit event to the global append-only audit log.
    
    This helper safely integrates with the global audit infrastructure:
    - Resolves DATA_DIR through app context (safe for extracted modules)
    - Recursively redacts sensitive metadata before persistence
    - Handles write failures gracefully (best-effort, never interrupts caller)
    
    Args:
        action: Event name (e.g. "cloud.run.queued", "cloud.run.completed")
        actor_user_id: Durable user ID of the actor (None for system events)
        target_type: Resource type being acted upon (e.g. "execution", "stack")
        target_id: Resource identifier within the target type
        meta: Additional context (will be redacted before persistence)
    """
    try:
        # Resolve data directory through app context (safe for extracted modules)
        data_dir = get_data_dir()
    except Exception as e:
        logger.debug("audit_events: failed to get data_dir from context: %s", e)
        # Fallback to environment variable with safe default
        data_dir = Path(
            "/data"  # Docker default
            if "DOCKER" in str(e)
            else str(Path.cwd() / "data")
        )
    
    try:
        # Redact sensitive information from metadata before persistence
        safe_meta = redact_sensitive(dict(meta or {})) if meta else None
        
        # Write to global audit log (best-effort - never interrupts caller)
        from storage.auth_db import audit
        audit(
            data_dir,
            action,
            actor_user_id=actor_user_id,
            target_type=target_type,
            target_id=target_id,
            meta=safe_meta,
            raise_on_error=False,
        )
    except Exception as e:
        logger.warning(
            "audit_events: failed to record '%s' event (actor=%s, target=%s/%s): %s",
            action,
            actor_user_id,
            target_type,
            target_id,
            e,
            exc_info=True,
        )