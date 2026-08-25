"""Cursor-based pagination utilities for Radia APIs (UC638)."""
from __future__ import annotations

import base64
import json
from typing import Any, Dict, List, Optional


def encode_cursor(value: Any) -> str:
    """Encode a value into an opaque base64-encoded cursor string."""
    data = json.dumps(value, separators=(",", ":"))
    return base64.urlsafe_b64encode(data.encode("utf-8")).decode("utf-8")


def decode_cursor(cursor_str: str) -> Optional[Any]:
    """Decode an opaque base64-encoded cursor string back to Python object."""
    if not cursor_str or not isinstance(cursor_str, str):
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor_str.encode("utf-8")).decode("utf-8")
        return json.loads(raw)
    except Exception:
        return None


def paginate_with_cursor(
    items: List[Dict[str, Any]],
    cursor: Optional[str] = None,
    limit: int = 20,
    sort_key: str = "id",
    reverse: bool = False,
) -> Dict[str, Any]:
    """Paginate a list of items using cursor-based pagination (UC638)."""
    limit = max(1, limit)
    sorted_items = sorted(items, key=lambda x: str(x.get(sort_key, "")), reverse=reverse)

    start_idx = 0
    if cursor:
        decoded = decode_cursor(cursor)
        target_val = decoded if not isinstance(decoded, dict) else decoded.get(sort_key, decoded.get("id"))
        for idx, it in enumerate(sorted_items):
            if it.get(sort_key) == target_val or it.get("id") == target_val:
                start_idx = idx + 1
                break

    page_items = sorted_items[start_idx : start_idx + limit]
    has_more = (start_idx + limit) < len(sorted_items)

    next_cursor = None
    if has_more and page_items:
        last_item = page_items[-1]
        next_cursor = encode_cursor({
            "id": last_item.get("id"),
            sort_key: last_item.get(sort_key),
        })

    return {
        "items": page_items,
        "limit": limit,
        "count": len(page_items),
        "total_items": len(sorted_items),
        "has_more": has_more,
        "next_cursor": next_cursor,
    }
