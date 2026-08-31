"""Pxpipe token-saver for the RADAS 9Router module.

Ports the upstream Pxpipe behavior: render bulky Claude-format request bodies
as dense PNGs via an external pxpipe-proxy service. Fail-open like every token
saver - any error, timeout, disabled state, or under-threshold payload returns
the original body untouched with a skip summary. Upstream reference:
open-sse/rtk/pxpipe.js (MIT, https://github.com/decolua/9router).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

DEFAULT_TIMEOUT_MS = 15_000
DEFAULT_MIN_CHARS = 25_000
EST_CHARS_PER_TOKEN = 4


def _skipped(reason: str, **extra: Any) -> dict[str, Any]:
    return {"applied": False, "reason": reason, **extra}


def _est_tokens(chars: int) -> int:
    return round(chars / EST_CHARS_PER_TOKEN)


def compress_with_pxpipe(
    body: dict[str, Any],
    *,
    transform: Any = None,
    enabled: bool = True,
    pxpipe_url: str = "",
    model: str = "",
    min_chars: int = DEFAULT_MIN_CHARS,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
) -> dict[str, Any]:
    """Transform one Claude-format request body via the pxpipe service.

    Returns {"body": <new body> | None, "summary": {...}} - body is None when
    nothing changed (skipped, failed, or unprofitable).
    """
    if not enabled:
        return {"body": None, "summary": _skipped("disabled")}
    url = (pxpipe_url or os.environ.get("PXPIPE_URL", "")).strip().rstrip("/")
    if not url:
        return {"body": None, "summary": _skipped("pxpipe_not_configured")}
    chars = len(json.dumps(body))
    if chars < min_chars:
        return {
            "body": None,
            "summary": _skipped("below_min_chars", chars=chars, min_chars=min_chars),
        }

    payload = {"body": body, "model": model}
    req = urllib.request.Request(
        f"{url}/transformAnthropicMessages",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_ms / 1000) as response:
            result = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        return {"body": None, "summary": _skipped("pxpipe_error", detail=str(exc)[:200])}
    new_body = result.get("body") if isinstance(result, dict) else None
    if not isinstance(new_body, dict):
        return {"body": None, "summary": _skipped("pxpipe_invalid_response")}
    after = len(json.dumps(new_body))
    if after >= chars:
        return {"body": None, "summary": _skipped("not_profitable", chars=chars, after=after)}
    return {
        "body": new_body,
        "summary": {
            "applied": True,
            "chars_before": chars,
            "chars_after": after,
            "est_tokens_before": _est_tokens(chars),
            "est_tokens_after": _est_tokens(after),
            "estimated": True,
        },
    }
