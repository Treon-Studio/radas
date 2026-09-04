"""Wire-format translators for the RADAS 9Router module.

Translates OpenAI chat-completions requests/responses to and from native
provider protocols (Anthropic Messages, Gemini generateContent), mirroring the
upstream 9Router translation layer for the text-chat subset:

- request: system extraction, role mapping, stop/temperature/max_tokens;
- response: content assembly, finish-reason and usage mapping;
- SSE: native event streams re-framed as OpenAI ``chat.completion.chunk``.

Text-only by design this iteration: non-text content parts raise a
non-retryable 400 so nothing is silently dropped. Tool calls, vision, and
audio remain untranslated (see docs/architecture/9router-parity.md).
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Iterable, Iterator

from .errors import GatewayError

ANTHROPIC_VERSION = "2023-06-01"

_ANTHROPIC_STOP = {"end_turn": "stop", "stop_sequence": "stop", "max_tokens": "length"}
_GEMINI_STOP = {"STOP": "stop", "MAX_TOKENS": "length", "SAFETY": "content_filter", "RECITATION": "content_filter"}


def _unsupported_content(provider: str) -> GatewayError:
    return GatewayError(
        f"Non-text message content is not supported for provider {provider}",
        status=400,
        retryable=False,
    )


def _flatten_text(content: Any, provider: str) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                texts.append(str(part.get("text") or ""))
            else:
                raise _unsupported_content(provider)
        return "\n".join(texts)
    raise _unsupported_content(provider)


# ---------------------------------------------------------------------------
# Anthropic Messages protocol
# ---------------------------------------------------------------------------

def anthropic_endpoint(base_url: str) -> str:
    base = (base_url or "").rstrip("/")
    if base.endswith("/v1/messages"):
        return base
    if base.endswith("/v1"):
        return f"{base}/messages"
    return f"{base}/v1/messages"


def openai_to_anthropic(payload: dict[str, Any]) -> dict[str, Any]:
    system_parts: list[str] = []
    convo: list[dict[str, Any]] = []
    for message in payload.get("messages") or []:
        role = str(message.get("role") or "")
        text = _flatten_text(message.get("content"), "anthropic")
        if role == "system":
            system_parts.append(text)
            continue
        a_role = "assistant" if role == "assistant" else "user"
        if convo and convo[-1]["role"] == a_role:
            convo[-1]["content"].append({"type": "text", "text": text})
        else:
            convo.append({"role": a_role, "content": [{"type": "text", "text": text}]})
    request: dict[str, Any] = {
        "model": payload.get("model"),
        "max_tokens": int(payload.get("max_tokens") or 4096),
        "messages": convo,
    }
    if system_parts:
        request["system"] = "\n\n".join(part for part in system_parts if part)
    if payload.get("temperature") is not None:
        request["temperature"] = float(payload["temperature"])
    if payload.get("top_p") is not None:
        request["top_p"] = float(payload["top_p"])
    stop = payload.get("stop")
    if isinstance(stop, str) and stop:
        request["stop_sequences"] = [stop]
    elif isinstance(stop, list) and stop:
        request["stop_sequences"] = [str(s) for s in stop if str(s)]
    return request


def anthropic_to_openai(response: dict[str, Any], model: str) -> dict[str, Any]:
    blocks = response.get("content") or []
    text = "".join(
        str(block.get("text") or "")
        for block in blocks
        if isinstance(block, dict) and block.get("type") == "text"
    )
    usage = response.get("usage") or {}
    prompt_tokens = int(usage.get("input_tokens") or 0)
    completion_tokens = int(usage.get("output_tokens") or 0)
    return {
        "id": str(response.get("id") or f"chatcmpl-{uuid.uuid4().hex[:12]}"),
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": _ANTHROPIC_STOP.get(response.get("stop_reason"), "stop"),
            }
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
    }


def anthropic_headers(api_key: str) -> dict[str, str]:
    return {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }


def anthropic_sse_to_openai(lines: Iterable[bytes], model: str) -> Iterator[bytes]:
    """Re-frame Anthropic Messages SSE events as OpenAI chat chunks."""
    chunk_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    created = int(time.time())
    usage: dict[str, int] = {}
    for raw in lines:
        line = raw.decode("utf-8", errors="replace").strip() if isinstance(raw, bytes) else str(raw).strip()
        if not line.startswith("data:"):
            continue
        payload_text = line[len("data:"):].strip()
        if not payload_text:
            continue
        try:
            event = json.loads(payload_text)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        event_type = event.get("type")
        if event_type == "message_start":
            message = event.get("message") or {}
            start_usage = message.get("usage") or {}
            usage["prompt_tokens"] = int(start_usage.get("input_tokens") or 0)
            yield _sse_frame(_chunk(chunk_id, created, model, {"role": "assistant", "content": ""}))
        elif event_type == "content_block_delta":
            delta = event.get("delta") or {}
            if delta.get("type") == "text_delta":
                yield _sse_frame(_chunk(chunk_id, created, model, {"content": str(delta.get("text") or "")}))
        elif event_type == "message_delta":
            delta_usage = event.get("usage") or {}
            if delta_usage.get("output_tokens") is not None:
                usage["completion_tokens"] = int(delta_usage.get("output_tokens") or 0)
            finish = _ANTHROPIC_STOP.get(event.get("delta", {}).get("stop_reason") if isinstance(event.get("delta"), dict) else None, "stop")
            yield _sse_frame(_chunk(chunk_id, created, model, {}, finish, usage or None))
        elif event_type == "message_stop":
            yield b"data: [DONE]\n\n"
            return
    yield b"data: [DONE]\n\n"


# ---------------------------------------------------------------------------
# Gemini generateContent protocol
# ---------------------------------------------------------------------------

def gemini_endpoint(base_url: str, model: str, *, stream: bool = False) -> str:
    base = (base_url or "").rstrip("/")
    action = "streamGenerateContent?alt=sse" if stream else "generateContent"
    if base.endswith("/v1beta"):
        return f"{base}/models/{model}:{action}"
    return f"{base}/v1beta/models/{model}:{action}"


def openai_to_gemini(payload: dict[str, Any]) -> dict[str, Any]:
    system_parts: list[str] = []
    contents: list[dict[str, Any]] = []
    for message in payload.get("messages") or []:
        role = str(message.get("role") or "")
        text = _flatten_text(message.get("content"), "gemini")
        if role == "system":
            system_parts.append(text)
            continue
        g_role = "model" if role == "assistant" else "user"
        if contents and contents[-1]["role"] == g_role:
            contents[-1]["parts"].append({"text": text})
        else:
            contents.append({"role": g_role, "parts": [{"text": text}]})
    request: dict[str, Any] = {"contents": contents}
    if system_parts:
        request["systemInstruction"] = {"parts": [{"text": "\n\n".join(part for part in system_parts if part)}]}
    generation: dict[str, Any] = {}
    if payload.get("max_tokens") is not None:
        generation["maxOutputTokens"] = int(payload["max_tokens"])
    if payload.get("temperature") is not None:
        generation["temperature"] = float(payload["temperature"])
    if payload.get("top_p") is not None:
        generation["topP"] = float(payload["top_p"])
    stop = payload.get("stop")
    if isinstance(stop, str) and stop:
        generation["stopSequences"] = [stop]
    elif isinstance(stop, list) and stop:
        generation["stopSequences"] = [str(s) for s in stop if str(s)]
    if generation:
        request["generationConfig"] = generation
    return request


def gemini_to_openai(response: dict[str, Any], model: str) -> dict[str, Any]:
    candidate = (response.get("candidates") or [{}])[0]
    content = candidate.get("content") or {}
    text = "".join(
        str(part.get("text") or "")
        for part in content.get("parts") or []
        if isinstance(part, dict) and part.get("text") is not None
    )
    usage = response.get("usageMetadata") or {}
    prompt_tokens = int(usage.get("promptTokenCount") or 0)
    completion_tokens = int(usage.get("candidatesTokenCount") or 0)
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": _GEMINI_STOP.get(candidate.get("finishReason"), "stop"),
            }
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
    }


def gemini_headers(api_key: str) -> dict[str, str]:
    return {"x-goog-api-key": api_key, "content-type": "application/json"}


def gemini_sse_to_openai(lines: Iterable[bytes], model: str) -> Iterator[bytes]:
    """Re-frame Gemini alt=sse events as OpenAI chat chunks."""
    chunk_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    created = int(time.time())
    for raw in lines:
        line = raw.decode("utf-8", errors="replace").strip() if isinstance(raw, bytes) else str(raw).strip()
        if not line.startswith("data:"):
            continue
        payload_text = line[len("data:"):].strip()
        if not payload_text:
            continue
        try:
            event = json.loads(payload_text)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        candidates = event.get("candidates") or []
        candidate = candidates[0] if candidates else {}
        content = candidate.get("content") or {}
        for part in content.get("parts") or []:
            if isinstance(part, dict) and part.get("text"):
                yield _sse_frame(_chunk(chunk_id, created, model, {"content": str(part["text"])}))
        usage = event.get("usageMetadata") or {}
        usage_map = None
        if usage:
            usage_map = {
                "prompt_tokens": int(usage.get("promptTokenCount") or 0),
                "completion_tokens": int(usage.get("candidatesTokenCount") or 0),
            }
        finish = _GEMINI_STOP.get(candidate.get("finishReason"))
        if finish:
            yield _sse_frame(_chunk(chunk_id, created, model, {}, finish, usage_map))
    yield b"data: [DONE]\n\n"


# ---------------------------------------------------------------------------
# Shared OpenAI chunk framing
# ---------------------------------------------------------------------------

def _chunk(chunk_id: str, created: int, model: str, delta: dict[str, Any], finish: str | None = None, usage: dict[str, int] | None = None) -> dict[str, Any]:
    chunk: dict[str, Any] = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }
    if usage:
        chunk["usage"] = usage
    return chunk


def _sse_frame(obj: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(obj)}\n\n".encode("utf-8")
