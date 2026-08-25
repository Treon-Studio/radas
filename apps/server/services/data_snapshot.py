"""Data snapshot export and restore service for disaster recovery (UC466)."""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

from storage import pg

logger = logging.getLogger(__name__)


def create_data_snapshot(project_id: str, include_types: Optional[List[str]] = None) -> Dict[str, Any]:
    """Export project configurations, stack metadata, and test cases into portable snapshot (UC466)."""
    stacks_rows = pg.query_all(
        "SELECT stack, data FROM stack_meta WHERE project_id = %s",
        (project_id,),
    )

    stacks_data = []
    for r in stacks_rows:
        meta = r.get("data")
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                pass
        stacks_data.append({"stack": r.get("stack"), "data": meta})

    return {
        "schema_version": "1.0",
        "project_id": project_id,
        "stacks": stacks_data,
        "exported_at": time.time(),
    }


def restore_data_snapshot(project_id: str, snapshot_data: Dict[str, Any]) -> Dict[str, Any]:
    """Restore project stack metadata from a data snapshot into database (UC466)."""
    stacks = snapshot_data.get("stacks", [])
    restored_count = 0

    for s in stacks:
        stack_name = s.get("stack")
        meta = s.get("data") or {}
        if not stack_name:
            continue

        pg.execute(
            "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s) "
            "ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data",
            (project_id, stack_name, json.dumps(meta) if isinstance(meta, dict) else str(meta)),
        )
        restored_count += 1

    logger.info(f"Restored {restored_count} stacks for project {project_id} from snapshot")
    return {
        "success": True,
        "project_id": project_id,
        "stacks_restored": restored_count,
        "restored_at": time.time(),
    }
