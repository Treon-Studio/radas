"""Token optimization primitives used by the RADAS 9Router module."""
from __future__ import annotations

from typing import Any

from .rtk import compress_text


def compress_messages(messages: list[dict[str, Any]], *, enabled: bool = True, mode: str = "off") -> tuple[list[dict[str, Any]], int]:
    """Apply RTK auto-detected filters per message; Caveman suffix once, on the
    final message (mirroring upstream's end-of-conversation prompt injection)."""
    if not enabled:
        return [dict(message) for message in messages], 0
    result: list[dict[str, Any]] = []
    saved = 0
    for message in messages:
        value = message.get("content")
        if not isinstance(value, str):
            result.append(dict(message))
            continue
        original = value
        value, _filter_name = compress_text(value)
        saved += max(0, len(original) - len(value)) // 4
        result.append({**message, "content": value})
    if mode in {"lite", "full", "ultra"} and result:
        last = result[-1]
        if isinstance(last.get("content"), str):
            last["content"] = _caveman(last["content"], mode)
    return result, saved


def _caveman(text: str, mode: str) -> str:
    """Apply the upstream-compatible concise instruction modifier."""
    if not text.strip():
        return text
    suffix = {
        "lite": "\n[Respond concisely; preserve essential details.]",
        "full": "\n[Be concise. Prefer actionable steps and compact code.]",
        "ultra": "\n[ULTRA CONCISE: return only the answer and required code.]",
    }[mode]
    return text + suffix
