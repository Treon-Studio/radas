"""Snapshot annotations, custom naming, and description manager (UC540)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from storage.kv import kv_get, kv_set

logger = logging.getLogger(__name__)

SNAPSHOT_ANNOTATION_SCOPE = "snapshot_annotations"


def annotate_snapshot(
    snapshot_id: str,
    title: str,
    description: str = "",
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Attach human-readable annotations, titles, and tags to an infrastructure snapshot (UC540)."""
    clean_id = snapshot_id.strip()
    entry = {
        "snapshot_id": clean_id,
        "title": title.strip(),
        "description": description.strip(),
        "tags": [str(t).strip() for t in (tags or []) if str(t).strip()],
        "annotated_at": time.time(),
    }
    kv_set(SNAPSHOT_ANNOTATION_SCOPE, clean_id, entry)
    logger.info(f"Annotated snapshot {clean_id}: '{title}'")
    return entry


def get_snapshot_annotation(snapshot_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve annotation metadata for a snapshot."""
    val = kv_get(SNAPSHOT_ANNOTATION_SCOPE, snapshot_id.strip())
    return dict(val) if isinstance(val, dict) else None
