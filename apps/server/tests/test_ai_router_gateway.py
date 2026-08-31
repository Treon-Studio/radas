from __future__ import annotations

import io
import json
import urllib.error

from services.ai_router.gateway import GatewayError, OpenAIGateway, ProviderTarget
from services.ai_router.providers import provider_for_model


class FakeResponse:
    def __init__(self, payload: bytes, status: int = 200):
        self.payload = payload
        self.status = status

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


def test_explicit_provider_prefixes():
    assert provider_for_model("cc/claude-sonnet") == "anthropic"
    assert provider_for_model("vertex/gemini-2.5-pro") == "google"
    assert provider_for_model("deepseek-chat") == "deepseek"


def test_openai_compatible_completion_uses_target_model():
    seen = {}

    def opener(req, timeout):
        seen["body"] = json.loads(req.data)
        seen["auth"] = req.headers["Authorization"]
        return FakeResponse(b'{"id":"x","choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1}}')

    result = OpenAIGateway(opener=opener).complete(ProviderTarget("openai", "gpt-test", "secret", "https://example.test/v1"), {"messages": []})
    assert result["id"] == "x"
    assert seen["body"]["model"] == "gpt-test"
    assert seen["auth"] == "Bearer secret"


def test_http_429_is_retryable():
    def opener(_req, timeout=None):
        raise urllib.error.HTTPError("https://example.test", 429, "quota", {}, io.BytesIO(b'{"error":{"message":"slow down"}}'))

    try:
        OpenAIGateway(opener=opener).complete(ProviderTarget("openai", "gpt", "secret", "https://example.test/v1"), {"messages": []})
    except GatewayError as exc:
        assert exc.retryable is True
        assert exc.status == 429
    else:
        raise AssertionError("expected GatewayError")


def test_stream_passes_sse_bytes():
    def opener(_req, timeout=None):
        return FakeResponse(b"data: {\\\"choices\\\":[]}\n\ndata: [DONE]\n")

    chunks = list(OpenAIGateway(opener=opener).stream(ProviderTarget("openai", "gpt", "secret", "https://example.test/v1"), {"messages": []}))
    assert chunks[0].startswith(b"data:")
    assert chunks[-1].endswith(b"\n")
