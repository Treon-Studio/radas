"""Stack metadata tagging, query selector, and batch tag assignment (UC431)."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from storage import pg

logger = logging.getLogger(__name__)


def assign_stack_tags(project_id: str, stack: str, tags: Dict[str, str]) -> Dict[str, Any]:
    """Assign or update key-value tags on a stack (UC431)."""
    row = pg.query_one(
        "SELECT data FROM stack_meta WHERE project_id = %s AND stack = %s",
        (project_id, stack),
    )
    meta = row.get("data") or {} if row else {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}

    current_tags = dict(meta.get("tags") or {})
    current_tags.update(tags)
    meta["tags"] = current_tags

    pg.execute(
        "INSERT INTO stack_meta (project_id, stack, data) VALUES (%s, %s, %s) "
        "ON CONFLICT (project_id, stack) DO UPDATE SET data = EXCLUDED.data",
        (project_id, stack, json.dumps(meta)),
    )

    logger.info(f"Assigned tags {tags} to stack {project_id}/{stack}")
    return {"project_id": project_id, "stack": stack, "tags": current_tags}


def get_stack_tags(project_id: str, stack: str) -> Dict[str, str]:
    """Get all key-value tags for a stack."""
    row = pg.query_one(
        "SELECT data FROM stack_meta WHERE project_id = %s AND stack = %s",
        (project_id, stack),
    )
    if not row or not row.get("data"):
        return {}

    meta = row["data"]
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}

    return dict(meta.get("tags") or {})


def find_stacks_by_tags(project_id: Optional[str], tag_filters: Dict[str, str]) -> List[Dict[str, Any]]:
    """Query stacks matching all specified tag key-value pairs (UC431)."""
    query = "SELECT project_id, stack, data FROM stack_meta"
    params = ()
    if project_id:
        query += " WHERE project_id = %s"
        params = (project_id,)

    rows = pg.query_all(query, params)
    matched: List[Dict[str, Any]] = []

    for r in rows:
        meta = r.get("data") or {}
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}

        stack_tags = meta.get("tags") or {}
        if all(stack_tags.get(k) == str(v) for k, v in tag_filters.items()):
            matched.append({
                "project_id": r.get("project_id"),
                "stack": r.get("stack"),
                "tags": stack_tags,
                "data": meta,
            })

    return matched
