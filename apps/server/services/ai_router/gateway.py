"""Functional OpenAI-compatible upstream gateway for the RADAS 9Router module."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from typing import Any, Iterator

from .errors import GatewayError
from .providers import spec_for


def _multipart_body(*, fields: dict[str, str], file_field: str, filename: str, content: bytes, file_content_type: str) -> tuple[bytes, str]:
    """Minimal multipart/form-data encoder (stdlib only)."""
    boundary = f"----radas9router{uuid.uuid4().hex}"
    parts: list[bytes] = []
    for name, value in fields.items():
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode("utf-8")
        )
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'
        f"Content-Type: {file_content_type}\r\n\r\n".encode("utf-8")
    )
    parts.append(content)
    parts.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"
from .translators import (
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


@dataclass(frozen=True)
class ProviderTarget:
    name: str
    model: str
    api_key: str
    base_url: str = ""


class OpenAIGateway:
    """Small dependency-free OpenAI-compatible adapter with bounded timeouts."""

    def __init__(self, *, timeout: float = 45.0, opener: Any = urllib.request.urlopen):
        self.timeout = timeout
        self._opener = opener

    @staticmethod
    def endpoint(target: ProviderTarget) -> str:
        base = (target.base_url or "").strip().rstrip("/")
        if not base:
            base = spec_for(target.name).base_url
        if not base:
            raise GatewayError(f"No base URL configured for provider {target.name}")
        return f"{base}/chat/completions"

    def request_json(self, target: ProviderTarget, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        base = (target.base_url or spec_for(target.name).base_url).rstrip("/")
        if not base:
            raise GatewayError(f"No base URL configured for provider {target.name}")
        req = urllib.request.Request(
            f"{base}/{path.lstrip('/')}",
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={"Accept": "application/json", "Content-Type": "application/json", "Authorization": f"Bearer {target.api_key}"},
        )
        try:
            with self._opener(req, timeout=self.timeout) as response:
                result = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise GatewayError(self._error_body(exc), status=exc.code, retryable=exc.code == 429 or exc.code >= 500) from exc
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            raise GatewayError("Upstream provider unavailable", retryable=True) from exc
        if not isinstance(result, dict):
            raise GatewayError("Upstream returned an invalid response")
        return result

    def embeddings(self, target: ProviderTarget, payload: dict[str, Any]) -> dict[str, Any]:
        if spec_for(target.name).protocol != "openai":
            raise GatewayError(
                f"Embeddings are not supported for provider {target.name} ({spec_for(target.name).protocol} protocol)",
                status=400,
                retryable=False,
            )
        request_payload = dict(payload)
        request_payload["model"] = target.model
        return self.request_json(target, "/embeddings", request_payload)

    @staticmethod
    def _capability_guard(target: ProviderTarget, capability: str) -> None:
        spec = spec_for(target.name)
        if spec.protocol != "openai" or capability not in spec.capabilities:
            raise GatewayError(
                f"{capability} requests are not supported for provider {target.name} ({spec.protocol} protocol)",
                status=400,
                retryable=False,
            )

    def images_generate(self, target: ProviderTarget, payload: dict[str, Any]) -> dict[str, Any]:
        """OpenAI-compatible image generation passthrough (URL or b64_json)."""
        self._capability_guard(target, "images")
        request_payload = dict(payload)
        request_payload["model"] = target.model
        result = self._post_json(f"{self._base(target)}/images/generations", request_payload, {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {target.api_key}",
        })
        if not isinstance(result, dict):
            raise GatewayError("Upstream returned an invalid image generation response")
        return result

    def responses_create(self, target: ProviderTarget, payload: dict[str, Any]) -> dict[str, Any]:
        """OpenAI Responses API passthrough (stateless use)."""
        self._capability_guard(target, "responses")
        request_payload = dict(payload)
        request_payload["model"] = target.model
        result = self._post_json(f"{self._base(target)}/responses", request_payload, {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {target.api_key}",
        })
        if not isinstance(result, dict):
            raise GatewayError("Upstream returned an invalid responses payload")
        return result

    def responses_stream(self, target: ProviderTarget, payload: dict[str, Any]) -> Iterator[bytes]:
        """SSE passthrough for OpenAI Responses API streaming."""
        self._capability_guard(target, "responses")
        request_payload = dict(payload)
        request_payload["model"] = target.model
        request_payload["stream"] = True
        req = urllib.request.Request(
            f"{self._base(target)}/responses",
            data=json.dumps(request_payload).encode("utf-8"),
            method="POST",
            headers={
                "Accept": "text/event-stream",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {target.api_key}",
            },
        )
        try:
            response = self._opener(req, timeout=self.timeout)
        except urllib.error.HTTPError as exc:
            raise GatewayError(self._error_body(exc), status=exc.code, retryable=exc.code == 429 or exc.code >= 500) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise GatewayError("Upstream provider unavailable", retryable=True) from exc

        def _iterate() -> Iterator[bytes]:
            try:
                for line in response:
                    yield line if isinstance(line, bytes) else line.encode("utf-8")
            finally:
                response.close()

        return _iterate()

    def _transcribe_gemini(self, target: ProviderTarget, *, file_bytes: bytes, filename: str, content_type: str) -> dict[str, Any]:
        """Native Gemini STT: audio inline_data through :generateContent."""
        import base64

        payload = {
            "contents": [{
                "role": "user",
                "parts": [
                    {"text": "Transcribe this audio exactly."},
                    {"inline_data": {"mime_type": content_type, "data": base64.b64encode(file_bytes).decode("ascii")}},
                ],
            }],
        }
        result = self._post_json(gemini_endpoint(self._base(target), target.model), payload, gemini_headers(target.api_key))
        candidate = (result.get("candidates") or [{}])[0]
        text = "".join(
            str(part.get("text") or "")
            for part in (candidate.get("content") or {}).get("parts") or []
            if isinstance(part, dict)
        )
        return {"text": text.strip()}

    def _speak_gemini(self, target: ProviderTarget, payload: dict[str, Any]) -> tuple[bytes, str]:
        """Native Gemini TTS: responseModalities AUDIO returns base64 PCM audio."""
        import base64

        generation = dict(payload.get("generationConfig") or {})
        generation["responseModalities"] = ["AUDIO"]
        if payload.get("voice"):
            generation["speechConfig"] = {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": str(payload["voice"])}}}
        request_payload = {
            "contents": [{"role": "user", "parts": [{"text": str(payload.get("input") or "")}]}],
            "generationConfig": generation,
        }
        result = self._post_json(gemini_endpoint(self._base(target), target.model), request_payload, gemini_headers(target.api_key))
        candidate = (result.get("candidates") or [{}])[0]
        audio_b64 = ""
        for part in (candidate.get("content") or {}).get("parts") or []:
            inline = part.get("inlineData") or part.get("inline_data") if isinstance(part, dict) else None
            if isinstance(inline, dict) and inline.get("data"):
                audio_b64 = str(inline["data"])
                break
        if not audio_b64:
            raise GatewayError("Upstream returned no audio data")
        return base64.b64decode(audio_b64), "audio/pcm;rate=24000"

    def video_create(self, target: ProviderTarget, payload: dict[str, Any], action: str) -> dict[str, Any]:
        """Async video job creation passthrough (upstream xai videoConfig shape)."""
        self._capability_guard(target, "video")
        request_payload = dict(payload)
        if target.model:
            request_payload["model"] = target.model
        suffix = "" if action == "generations" else f"/{action}"
        result = self._post_json(f"{self._base(target)}/videos{suffix}", request_payload, {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {target.api_key}",
        })
        if not isinstance(result, dict):
            raise GatewayError("Upstream returned an invalid video job response")
        return result

    def video_status(self, target: ProviderTarget, video_id: str) -> dict[str, Any]:
        """Poll one async video job."""
        self._capability_guard(target, "video")
        req = urllib.request.Request(
            f"{self._base(target)}/videos/{video_id}",
            method="GET",
            headers={"Accept": "application/json", "Authorization": f"Bearer {target.api_key}"},
        )
        try:
            with self._opener(req, timeout=self.timeout) as response:
                result = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise GatewayError(self._error_body(exc), status=exc.code, retryable=exc.code == 429 or exc.code >= 500) from exc
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            raise GatewayError("Upstream provider unavailable", retryable=True) from exc
        if not isinstance(result, dict):
            raise GatewayError("Upstream returned an invalid video job response")
        return result

    @staticmethod
    def _audio_guard(target: ProviderTarget) -> None:
        spec = spec_for(target.name)
        if "audio" not in spec.capabilities:
            raise GatewayError(
                f"Audio endpoints are not supported for provider {target.name} ({spec.protocol} protocol)",
                status=400,
                retryable=False,
            )

    def transcribe(self, target: ProviderTarget, *, file_bytes: bytes, filename: str, content_type: str, fields: dict[str, str]) -> dict[str, Any]:
        """Speech-to-text; OpenAI multipart passthrough or native Gemini audio."""
        self._audio_guard(target)
        if spec_for(target.name).protocol == "gemini":
            return self._transcribe_gemini(target, file_bytes=file_bytes, filename=filename, content_type=content_type)
        body, multipart_type = _multipart_body(
            fields=fields,
            file_field="file",
            filename=filename,
            content=file_bytes,
            file_content_type=content_type,
        )
        req = urllib.request.Request(
            f"{self._base(target)}/audio/transcriptions",
            data=body,
            method="POST",
            headers={"Authorization": f"Bearer {target.api_key}", "Content-Type": multipart_type},
        )
        try:
            with self._opener(req, timeout=self.timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            raise GatewayError(self._error_body(exc), status=exc.code, retryable=exc.code == 429 or exc.code >= 500) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise GatewayError("Upstream provider unavailable", retryable=True) from exc
        try:
            result = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise GatewayError("Upstream returned an invalid transcription response") from exc
        if not isinstance(result, dict):
            raise GatewayError("Upstream returned an invalid transcription response")
        return result

    def speak(self, target: ProviderTarget, payload: dict[str, Any]) -> tuple[bytes, str]:
        """Text-to-speech; OpenAI passthrough or native Gemini audio generation."""
        self._audio_guard(target)
        if spec_for(target.name).protocol == "gemini":
            return self._speak_gemini(target, payload)
        req = urllib.request.Request(
            f"{self._base(target)}/audio/speech",
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={"Accept": "audio/*", "Content-Type": "application/json", "Authorization": f"Bearer {target.api_key}"},
        )
        try:
            with self._opener(req, timeout=self.timeout) as response:
                return response.read(), response.headers.get_content_type()
        except urllib.error.HTTPError as exc:
            raise GatewayError(self._error_body(exc), status=exc.code, retryable=exc.code == 429 or exc.code >= 500) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise GatewayError("Upstream provider unavailable", retryable=True) from exc

    def complete(self, target: ProviderTarget, payload: dict[str, Any]) -> dict[str, Any]:
        protocol = spec_for(target.name).protocol
        if protocol == "anthropic":
            return self._complete_anthropic(target, payload)
        if protocol == "gemini":
            return self._complete_gemini(target, payload)
        request_payload = dict(payload)
        request_payload["model"] = target.model
        request_payload["stream"] = False
        result = self._post_json(self.endpoint(target), request_payload, {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {target.api_key}",
        })
        if not isinstance(result, dict):
            raise GatewayError("Upstream returned an invalid response")
        return result

    def _base(self, target: ProviderTarget) -> str:
        base = (target.base_url or "").strip().rstrip("/")
        return base or spec_for(target.name).base_url

    def _complete_anthropic(self, target: ProviderTarget, payload: dict[str, Any]) -> dict[str, Any]:
        translated = openai_to_anthropic({**payload, "model": target.model})
        result = self._post_json(anthropic_endpoint(self._base(target)), translated, anthropic_headers(target.api_key))
        if not isinstance(result, dict):
            raise GatewayError("Upstream returned an invalid response")
        return anthropic_to_openai(result, target.model)

    def _complete_gemini(self, target: ProviderTarget, payload: dict[str, Any]) -> dict[str, Any]:
        translated = openai_to_gemini(payload)
        result = self._post_json(gemini_endpoint(self._base(target), target.model), translated, gemini_headers(target.api_key))
        if not isinstance(result, dict):
            raise GatewayError("Upstream returned an invalid response")
        return gemini_to_openai(result, target.model)

    def _post_json(self, url: str, payload: dict[str, Any], headers: dict[str, str]) -> Any:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST", headers=headers)
        try:
            with self._opener(req, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            retryable = exc.code == 429 or exc.code >= 500
            detail = self._error_body(exc)
            raise GatewayError(detail, status=exc.code, retryable=retryable) from exc
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            raise GatewayError("Upstream provider unavailable", retryable=True) from exc

    def stream(self, target: ProviderTarget, payload: dict[str, Any]) -> Iterator[bytes]:
        protocol = spec_for(target.name).protocol
        translator = None
        if protocol == "anthropic":
            translated = openai_to_anthropic({**payload, "model": target.model})
            translated["stream"] = True
            url = anthropic_endpoint(self._base(target))
            headers = {**anthropic_headers(target.api_key), "Accept": "text/event-stream"}
            translator = anthropic_sse_to_openai
        elif protocol == "gemini":
            translated = openai_to_gemini(payload)
            url = gemini_endpoint(self._base(target), target.model, stream=True)
            headers = {**gemini_headers(target.api_key), "Accept": "text/event-stream"}
            translator = gemini_sse_to_openai
        else:
            translated = dict(payload)
            translated["model"] = target.model
            translated["stream"] = True
            url = self.endpoint(target)
            headers = {
                "Accept": "text/event-stream",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {target.api_key}",
            }
        req = urllib.request.Request(url, data=json.dumps(translated).encode("utf-8"), method="POST", headers=headers)
        try:
            response = self._opener(req, timeout=self.timeout)
        except urllib.error.HTTPError as exc:
            raise GatewayError(self._error_body(exc), status=exc.code, retryable=exc.code == 429 or exc.code >= 500) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise GatewayError("Upstream provider unavailable", retryable=True) from exc

        def _iterate() -> Iterator[bytes]:
            try:
                if translator is not None:
                    yield from translator(response, target.model)
                else:
                    for line in response:
                        yield line if isinstance(line, bytes) else line.encode("utf-8")
            finally:
                response.close()

        return _iterate()

    @staticmethod
    def _error_body(exc: urllib.error.HTTPError) -> str:
        try:
            raw = exc.read(4096).decode("utf-8", errors="replace")
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                error = parsed.get("error")
                if isinstance(error, dict) and error.get("message"):
                    return str(error["message"])
                if isinstance(error, str):
                    return error
        except Exception:
            pass
        return f"Upstream provider returned HTTP {exc.code}"


def usage_from_response(response: dict[str, Any], messages: list[dict[str, Any]]) -> tuple[int, int]:
    usage = response.get("usage") if isinstance(response, dict) else None
    if isinstance(usage, dict):
        return int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0)
    prompt = sum(len(str(message.get("content") or "")) for message in messages) // 4
    completion = sum(len(str(choice.get("message", {}).get("content") or "")) for choice in response.get("choices", []) if isinstance(choice, dict)) // 4
    return prompt, completion
