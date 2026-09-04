from __future__ import annotations

import json

import pytest

from services.ai_router.errors import GatewayError
from services.ai_router.gateway import OpenAIGateway, ProviderTarget
from services.ai_router.translators import (
    anthropic_endpoint,
    anthropic_headers,
    anthropic_sse_to_openai,
    anthropic_to_openai,
    gemini_endpoint,
    gemini_headers,
    gemini_sse_to_openai,
    gemini_to_openai,
    openai_to_anthropic,
    openai_to_gemini,
)


class FakeResponse:
    def __init__(self, payload: bytes, status: int = 200):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, *_args):
        return self.payload

    def __iter__(self):
        return iter(self.payload.splitlines(keepends=True))

    def close(self):
        pass


OPENAI_REQUEST = {
    "model": "claude-3-5-sonnet",
    "messages": [
        {"role": "system", "content": "Be terse."},
        {"role": "user", "content": "Hello"},
        {"role": "user", "content": "Again"},
        {"role": "assistant", "content": "Hi"},
    ],
    "max_tokens": 512,
    "stop": ["STOP", "END"],
    "temperature": 0.2,
}


def test_anthropic_request_translation():
    req = openai_to_anthropic(OPENAI_REQUEST)
    assert req["model"] == "claude-3-5-sonnet"
    assert req["max_tokens"] == 512
    assert req["system"] == "Be terse."
    assert req["stop_sequences"] == ["STOP", "END"]
    assert req["temperature"] == 0.2
    # Consecutive user messages merge into one Anthropic turn.
    assert [m["role"] for m in req["messages"]] == ["user", "assistant"]
    assert len(req["messages"][0]["content"]) == 2


def test_anthropic_request_defaults_max_tokens():
    req = openai_to_anthropic({"model": "m", "messages": [{"role": "user", "content": "x"}]})
    assert req["max_tokens"] == 4096


def test_anthropic_response_translation():
    upstream = {
        "id": "msg_123",
        "content": [{"type": "text", "text": "Hello!"}, {"type": "text", "text": " Bye"}],
        "stop_reason": "max_tokens",
        "usage": {"input_tokens": 11, "output_tokens": 4},
    }
    result = anthropic_to_openai(upstream, "claude-3-5-sonnet")
    assert result["object"] == "chat.completion"
    assert result["model"] == "claude-3-5-sonnet"
    assert result["choices"][0]["message"]["content"] == "Hello! Bye"
    assert result["choices"][0]["finish_reason"] == "length"
    assert result["usage"] == {"prompt_tokens": 11, "completion_tokens": 4, "total_tokens": 15}


def test_anthropic_gateway_dispatch():
    seen = {}

    def opener(req, timeout=None):
        seen["url"] = req.full_url
        seen["headers"] = dict(req.headers)
        return FakeResponse(json.dumps({
            "id": "msg_9",
            "content": [{"type": "text", "text": "ok"}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 3, "output_tokens": 1},
        }).encode())

    result = OpenAIGateway(opener=opener).complete(
        ProviderTarget("anthropic", "claude-3-5-sonnet", "sk-ant", ""), OPENAI_REQUEST
    )
    assert seen["url"] == "https://api.anthropic.com/v1/messages"
    assert seen["headers"]["X-api-key"] == "sk-ant"
    assert seen["headers"]["Anthropic-version"] == "2023-06-01"
    assert result["choices"][0]["message"]["content"] == "ok"
    assert result["usage"]["prompt_tokens"] == 3


def test_anthropic_sse_translation():
    events = (
        b'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":7}}}\n\n'
        b'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"He"}}\n\n'
        b'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"y"}}\n\n'
        b'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n'
        b'event: message_stop\ndata: {"type":"message_stop"}\n\n'
    )
    frames = [json.loads(chunk[len(b"data: "):].strip()) for chunk in anthropic_sse_to_openai(iter([events[i:i + 1] for i in range(0)]), "m")] if False else None
    chunks_raw = list(anthropic_sse_to_openai((events[j:j + 1] for j in range(0)), "m")) if False else None
    lines = events.splitlines(keepends=True)
    out = b"".join(anthropic_sse_to_openai(lines, "claude-3-5-sonnet"))
    frames = [ln[len("data: "):].strip() for ln in out.splitlines() if ln.startswith(b"data: ")]
    parsed = [json.loads(f) for f in frames[:-1]]
    assert frames[-1] == b"[DONE]"
    assert parsed[0]["choices"][0]["delta"] == {"role": "assistant", "content": ""}
    assert parsed[1]["choices"][0]["delta"]["content"] == "He"
    assert parsed[2]["choices"][0]["delta"]["content"] == "y"
    final = parsed[-1]
    assert final["choices"][0]["finish_reason"] == "stop"
    assert final["usage"] == {"prompt_tokens": 7, "completion_tokens": 2}


def test_gemini_request_translation():
    req = openai_to_gemini(OPENAI_REQUEST)
    assert req["systemInstruction"]["parts"][0]["text"] == "Be terse."
    roles = [c["role"] for c in req["contents"]]
    assert roles == ["user", "model"]
    assert len(req["contents"][0]["parts"]) == 2
    assert req["generationConfig"] == {
        "maxOutputTokens": 512,
        "temperature": 0.2,
        "stopSequences": ["STOP", "END"],
    }


def test_gemini_response_translation():
    upstream = {
        "candidates": [{"content": {"parts": [{"text": "Hi"}, {"text": " there"}]}, "finishReason": "STOP"}],
        "usageMetadata": {"promptTokenCount": 9, "candidatesTokenCount": 2},
    }
    result = gemini_to_openai(upstream, "gemini-1.5-flash")
    assert result["choices"][0]["message"]["content"] == "Hi there"
    assert result["choices"][0]["finish_reason"] == "stop"
    assert result["usage"] == {"prompt_tokens": 9, "completion_tokens": 2, "total_tokens": 11}


def test_gemini_gateway_dispatch():
    seen = {}

    def opener(req, timeout=None):
        seen["url"] = req.full_url
        seen["headers"] = dict(req.headers)
        return FakeResponse(json.dumps({
            "candidates": [{"content": {"parts": [{"text": "ok"}]}, "finishReason": "STOP"}],
            "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 1},
        }).encode())

    result = OpenAIGateway(opener=opener).complete(
        ProviderTarget("google", "gemini-1.5-flash", "g-key", ""), {"messages": [{"role": "user", "content": "hi"}]}
    )
    assert seen["url"] == "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
    assert seen["headers"]["X-goog-api-key"] == "g-key"
    assert result["choices"][0]["message"]["content"] == "ok"


def test_gemini_sse_translation():
    events = (
        b'data: {"candidates":[{"content":{"parts":[{"text":"He"}]}}]}\n\n'
        b'data: {"candidates":[{"content":{"parts":[{"text":"y"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2}}\n\n'
    )
    out = b"".join(gemini_sse_to_openai(events.splitlines(keepends=True), "gemini-1.5-flash"))
    frames = [ln[len("data: "):].strip() for ln in out.splitlines() if ln.startswith(b"data: ")]
    parsed = [json.loads(f) for f in frames[:-1]]
    assert frames[-1] == b"[DONE]"
    assert parsed[0]["choices"][0]["delta"]["content"] == "He"
    assert parsed[-1]["choices"][0]["finish_reason"] == "stop"
    assert parsed[-1]["usage"] == {"prompt_tokens": 4, "completion_tokens": 2}


def test_streamed_anthropic_translation_end_to_end():
    events = (
        b'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"yo"}}\n\n'
        b'event: message_stop\ndata: {"type":"message_stop"}\n\n'
    )

    def opener(req, timeout=None):
        assert req.full_url.endswith("/v1/messages")
        return FakeResponse(events)

    chunks = list(OpenAIGateway(opener=opener).stream(
        ProviderTarget("anthropic", "claude-3-5-sonnet", "sk", ""), {"messages": [{"role": "user", "content": "hi"}]}
    ))
    body = b"".join(chunks)
    frames = [json.loads(ln[len("data: "):]) for ln in body.splitlines() if ln.startswith(b"data: ") and ln != b"data: [DONE]"]
    deltas = [frame["choices"][0]["delta"].get("content") for frame in frames]
    assert "yo" in deltas
    assert body.endswith(b"data: [DONE]\n\n")


def test_unsupported_content_part_is_client_error():
    with pytest.raises(GatewayError) as excinfo:
        openai_to_anthropic({"model": "m", "messages": [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": "x"}}]}]})
    assert excinfo.value.status == 400
    assert excinfo.value.retryable is False


def test_gemini_endpoint_stream_variant():
    assert gemini_endpoint("", "m", stream=True).endswith(":streamGenerateContent?alt=sse")
    assert anthropic_endpoint("https://api.anthropic.com/v1") == "https://api.anthropic.com/v1/messages"
