"""Automated TTL expiration sweeper for ephemeral preview environments (UC499)."""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

from storage import pg

logger = logging.getLogger(__name__)


def sweep_expired_previews(project_id: str, current_time: Optional[float] = None) -> List[Dict[str, Any]]:
    """Scan preview environments in project and identify expired stacks (UC499)."""
    now = current_time if current_time is not None else time.time()
    rows = pg.query_all(
        "SELECT stack, data FROM stack_meta WHERE project_id = %s",
        (project_id,),
    )

    swept: List[Dict[str, Any]] = []

    for r in rows:
        meta = r.get("data")
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}

        if not isinstance(meta, dict):
            continue

        is_preview = bool(meta.get("preview") or "preview" in r.get("stack", ""))
        if not is_preview:
            continue

        expires_at = meta.get("expires_at")
        if expires_at and float(expires_at) < now:
            swept.append({
                "project_id": project_id,
                "stack": r.get("stack"),
                "expires_at": float(expires_at),
                "action": "scheduled_destroy",
                "swept_at": now,
            })
            logger.info(f"Queued expired preview stack {project_id}/{r.get('stack')} for deletion")

    return swept
