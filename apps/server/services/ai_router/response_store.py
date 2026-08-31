"""Stateful Responses storage for the RADAS 9Router module.

Implements the store=true / previous_response_id contract of the Responses API
on top of stateless upstreams: conversations are persisted per organization in
PostgreSQL and replayed as context on follow-up calls.
"""
from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List, Optional

from storage import pg

MAX_CONTEXT_DEPTH = 20


def store_response(
    *,
    org_id: str,
    user_id: str,
    provider_name: str,
    model: str,
    input_messages: List[Dict[str, Any]],
    output_json: Any,
    output_text: str,
    previous_response_id: Optional[str] = None,
) -> str:
    response_id = f"resp-{uuid.uuid4().hex[:24]}"
    pg.execute(
        """INSERT INTO org_ai_responses
           (id, org_id, user_id, provider_name, model, input_messages, output_json, output_text, previous_response_id, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (
            response_id,
            org_id,
            user_id or "system",
            provider_name or None,
            model or None,
            json_dumps(input_messages),
            json_dumps(output_json),
            output_text or "",
            previous_response_id,
            time.time(),
        ),
    )
    return response_id


def json_dumps(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=False)


def get_response(org_id: str, response_id: str) -> Optional[Dict[str, Any]]:
    row = pg.query_one(
        "SELECT id, org_id, user_id, provider_name, model, input_messages, output_json, output_text, previous_response_id, created_at "
        "FROM org_ai_responses WHERE id = %s AND org_id = %s",
        (response_id, org_id),
    )
    if not row:
        return None
    return _decoded(row)


def _decoded(row: Dict[str, Any]) -> Dict[str, Any]:
    import json

    row = dict(row)
    for key in ("input_messages", "output_json"):
        value = row.get(key)
        if isinstance(value, str):
            try:
                row[key] = json.loads(value)
            except (TypeError, ValueError):
                row[key] = [] if key == "input_messages" else None
    return row


def build_context_messages(org_id: str, previous_response_id: str) -> List[Dict[str, Any]]:
    """Replay a stored response chain (oldest first) as chat-style messages."""
    messages: List[Dict[str, Any]] = []
    seen: set[str] = set()
    response_id: Optional[str] = previous_response_id
    while response_id and len(messages) < MAX_CONTEXT_DEPTH and response_id not in seen:
        seen.add(response_id)
        row = get_response(org_id, response_id)
        if not row:
            break
        input_messages = row.get("input_messages") or []
        if isinstance(input_messages, list):
            messages.extend(m for m in input_messages if isinstance(m, dict))
        output_text = row.get("output_text") or ""
        if output_text:
            messages.append({"role": "assistant", "content": output_text})
        response_id = row.get("previous_response_id")
    return messages
