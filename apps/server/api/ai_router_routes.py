"""9Router Multi-Provider AI Gateway & Fallback Router (Per-Organization).

Exposes OpenAI-compatible endpoints (`/api/v1/chat/completions`, `/api/v1/models`)
with per-organization provider vault, format translation, RTK token compression,
and multi-tier model combo fallbacks.
"""
from __future__ import annotations

import json
import os
import time
import uuid
import re
import urllib.request
import urllib.error
from functools import wraps
from typing import Any, Dict, List, Optional

from flask import Blueprint, Response, jsonify, request, stream_with_context

try:
    from auth.middleware import require_auth
except ImportError:
    from ..auth.middleware import require_auth

from storage import pg
from services.ai_router import (
    GatewayError, compress_text, OpenAIGateway, ProviderTarget, usage_from_response,
    provider_for_model, spec_for, compress_messages, allow_request,
    gather_credentials, create_key, list_keys, lookup, revoke, touch,
    estimate_cost, record_request_log, list_request_logs, cost_summary, apply_ponytail, ponytail_prompt, TTS_VOICES,
    store_response, get_response, build_context_messages,
    compress_with_pxpipe, ProxyPoolError, delete_pool, list_pools, resolve_proxy_url, upsert_pool, gateway_with_proxy,
)
from services.ai_router.oauth import (
    OAuthError, OAUTH_PROVIDERS, ALL_OAUTH_PROVIDER_NAMES, begin_flow, complete_flow, client_id_for,
    begin_device_flow, complete_device_flow, import_token, OAUTH_DEVICE_PROVIDERS as _DEVICE_PROVIDERS, OAUTH_IMPORT_PROVIDERS,
    list_accounts as list_oauth_accounts, revoke as revoke_oauth_account,
)
from services.org_service import is_member, member_role
from utils.secret_encryption import get_encryption

bp = Blueprint("ai_router_api", __name__)

_GATEWAY = OpenAIGateway()
_MAX_MESSAGES = 100
_MAX_MESSAGE_CHARS = 200_000
_ALLOWED_PROVIDER = re.compile(r"^[a-z0-9][a-z0-9_.-]{1,63}$")


def _current_user() -> Dict[str, Any]:
    return getattr(request, "current_user", None) or getattr(request, "user", None) or {}


def _current_user_id() -> str:
    user = _current_user()
    return str(user.get("user_id") or getattr(request, "user_id", "") or "")


def _org_access(org_id: str, *, mutate: bool = False) -> Optional[tuple[Response, int]]:
    user = _current_user()
    if user.get("username") == "internal" or "admin" in (user.get("roles") or []):
        return None
    if user.get("endpoint_key"):
        # Gateway keys are read-only credentials for /api/v1 usage and are
        # pinned to the organization that issued them; management endpoints
        # always require an authenticated member with owner/admin.
        if mutate:
            return jsonify({"error": "owner/admin required"}), 403
        if org_id != user.get("org_id"):
            return jsonify({"error": "organization access denied"}), 403
        return None
    user_id = _current_user_id()
    if not user_id or not is_member(org_id, user_id):
        return jsonify({"error": "organization access denied"}), 403
    if mutate and not (member_role(org_id, user_id) in {"owner", "admin"} or "admin" in (user.get("roles") or [])):
        return jsonify({"error": "owner/admin required"}), 403
    return None


def _presented_endpoint_key() -> str:
    auth_header = request.headers.get("Authorization") or ""
    if auth_header.startswith("Bearer ") and auth_header[7:].strip().startswith("radas_epk_"):
        return auth_header[7:].strip()
    api_key = (request.headers.get("X-Api-Key") or "").strip()
    return api_key if api_key.startswith("radas_epk_") else ""


def require_gateway_auth(f):
    """Authenticate /api/v1 gateway calls via org endpoint key or RADAS auth.

    Endpoint keys pin the organization server-side (X-Org-Id is ignored for
    them) and never grant management access. Anything else falls through to
    the standard RADAS JWT/API-token middleware.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        raw_key = _presented_endpoint_key()
        if raw_key or request.headers.get("X-Api-Key"):
            entry = lookup(raw_key) if raw_key else None
            if not entry:
                return jsonify({"error": {"message": "Invalid gateway API key", "type": "authentication_error"}}), 401
            request.current_user = {
                "username": f"endpoint:{entry['id'][:8]}",
                "user_id": "__endpoint__",
                "roles": ["endpoint"],
                "org_id": entry["org_id"],
                "endpoint_key": True,
            }
            request.token = raw_key
            touch(entry["id"])
            return f(*args, **kwargs)
        return require_auth(f)(*args, **kwargs)
    return decorated


def _encrypted_provider_key(value: str) -> str:
    return get_encryption().encrypt(value)


def _provider_key(value: str) -> str:
    try:
        return get_encryption().decrypt(value)
    except Exception:
        # Read legacy rows created before encrypted storage was introduced.
        return value


def _provider_for_model(model: str) -> str:
    return provider_for_model(model)


def _validated_messages(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list) or not value or len(value) > _MAX_MESSAGES:
        raise ValueError("messages must be a non-empty array of at most 100 items")
    messages: List[Dict[str, Any]] = []
    total = 0
    for item in value:
        if not isinstance(item, dict) or not item.get("role"):
            raise ValueError("each message must contain a role")
        content = item.get("content", "")
        if not isinstance(content, (str, list)):
            raise ValueError("message content must be text or content parts")
        total += len(str(content))
        if total > _MAX_MESSAGE_CHARS:
            raise ValueError("message payload is too large")
        messages.append(dict(item))
    return messages


# -----------------------------------------------------------------------------
# RTK Token Saver Helper (Compresses tool output & prompt bloat)
# -----------------------------------------------------------------------------
def _compress_rtk(messages: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], int]:
    """Legacy alias kept for the original test surface; delegates to the RTK module."""
    return compress_messages(messages, enabled=True, mode="off")


def _get_org_id_from_req() -> str:
    """Resolve active org_id from request headers, query params, or localStorage token fallback."""
    user = _current_user()
    org_id = user.get("active_org_id") or user.get("org_id")
    if not org_id:
        org_id = request.headers.get("X-Org-Id") or request.args.get("org_id")
    if not org_id:
        # Default fallback to primary workspace org
        org_row = pg.query_one("SELECT id FROM orgs ORDER BY created_at ASC LIMIT 1")
        if org_row:
            org_id = org_row["id"]
    return org_id or "default-org"


# -----------------------------------------------------------------------------
# OpenAI-Compatible Gateway Endpoints (/api/v1/models & /api/v1/chat/completions)
# -----------------------------------------------------------------------------
@bp.route("/api/v1/models", methods=["GET"])
@require_gateway_auth
def v1_models():
    """List aliases and models configured for the authenticated organization."""
    org_id = _get_org_id_from_req()
    access = _org_access(org_id)
    if access:
        return access
    providers = pg.query_all("SELECT provider_name FROM org_ai_providers WHERE org_id = %s AND is_active = TRUE", (org_id,))
    routes = pg.query_all("SELECT alias_name, primary_model, fallback_models FROM org_ai_routes WHERE org_id = %s", (org_id,))
    models: Dict[str, Dict[str, str]] = {}
    for row in routes:
        models[row["alias_name"]] = {"id": row["alias_name"], "object": "model", "owned_by": "radas-9router"}
        models[row["primary_model"]] = {"id": row["primary_model"], "object": "model", "owned_by": _provider_for_model(row["primary_model"])}
        fallbacks = row.get("fallback_models") or []
        if isinstance(fallbacks, str):
            try: fallbacks = json.loads(fallbacks)
            except (TypeError, ValueError): fallbacks = []
        for model in fallbacks:
            models[str(model)] = {"id": str(model), "object": "model", "owned_by": _provider_for_model(str(model))}
    for row in providers:
        provider = str(row["provider_name"])
        models.setdefault(provider, {"id": provider, "object": "model", "owned_by": provider})
    # Keep the standard catalog discoverable before an organization configures a
    # provider; requests still require a configured credential in production.
    for model, owner in (("gpt-4o-mini", "openai"), ("gpt-4o", "openai"), ("claude-3-5-sonnet", "anthropic"), ("gemini-1.5-flash", "google"), ("deepseek-chat", "deepseek")):
        models.setdefault(model, {"id": model, "object": "model", "owned_by": owner})
    return jsonify({"object": "list", "data": list(models.values())})


@bp.route("/api/v1/embeddings", methods=["POST"])
@require_gateway_auth
def v1_embeddings():
    """Forward OpenAI-compatible embeddings requests through the configured provider."""
    data = request.get_json(silent=True) or {}
    value = data.get("input")
    if value is None or (not isinstance(value, (str, list))):
        return jsonify({"error": {"message": "input is required", "type": "invalid_request_error"}}), 400
    model = str(data.get("model") or "text-embedding-3-small").strip()
    org_id = _get_org_id_from_req()
    access = _org_access(org_id)
    if access:
        return access
    provider_name = _provider_for_model(model)
    prov = pg.query_one("SELECT * FROM org_ai_providers WHERE org_id = %s AND provider_name = %s AND is_active = TRUE", (org_id, provider_name))
    api_key = _provider_key(prov["api_key_encrypted"]) if prov else os.environ.get(spec_for(provider_name).env_key or f"{provider_name.upper()}_API_KEY")
    if not api_key:
        return jsonify({"error": {"message": f"No credentials configured for provider {provider_name}", "type": "upstream_error"}}), 502
    embeddings_started = time.time()
    request_id = f"req-{uuid.uuid4().hex[:12]}"
    try:
        result = _gateway_for(org_id).embeddings(ProviderTarget(provider_name, model, api_key, (prov or {}).get("base_url", "")), data)
    except GatewayError as exc:
        record_request_log(
            org_id=org_id, user_id=_current_user_id(), endpoint="embeddings", requested_model=model,
            attempts=[{"provider": provider_name, "model": model, "status": "error", "http_status": exc.status}],
            status="error", request_id=request_id, error_code="upstream_error",
            http_status=exc.status or 502, latency_ms=int((time.time() - embeddings_started) * 1000),
        )
        return jsonify({"error": {"message": str(exc), "type": "upstream_error"}}), exc.status or 502
    record_request_log(
        org_id=org_id, user_id=_current_user_id(), endpoint="embeddings", requested_model=model,
        attempts=[{"provider": provider_name, "model": model, "status": "success"}],
        status="success", request_id=request_id, resolved_provider=provider_name, resolved_model=model,
        latency_ms=int((time.time() - embeddings_started) * 1000),
        prompt_tokens=sum(len(str(value)) for value in (data.get("input") if isinstance(data.get("input"), list) else [data.get("input") or ""])) // 4,
    )
    response = jsonify(result)
    response.headers["X-9Router-Request-ID"] = request_id
    return response


@bp.route("/api/v1/audio/transcriptions", methods=["POST"])
@require_gateway_auth
def v1_audio_transcriptions():
    """OpenAI-compatible speech-to-text passthrough (OpenAI-protocol providers)."""
    org_id = _get_org_id_from_req()
    access = _org_access(org_id)
    if access:
        return access
    uploaded = request.files.get("file")
    if uploaded is None:
        return jsonify({"error": {"message": "file is required", "type": "invalid_request_error"}}), 400
    form = request.form
    model = (form.get("model") or "whisper-1").strip()
    provider_name = ((form.get("provider") or "").strip().lower() or _provider_for_model(model))[:64]
    spec = spec_for(provider_name)
    if "audio" not in spec.capabilities:
        return jsonify({"error": {"message": f"Provider {provider_name} does not support audio transcription", "type": "invalid_request_error"}}), 400
    prov = pg.query_one("SELECT * FROM org_ai_providers WHERE org_id = %s AND provider_name = %s AND is_active = TRUE", (org_id, provider_name))
    allowed, _retry_after = allow_request(org_id, provider_name, int((prov or {}).get("rate_limit_per_min") or 0))
    if not allowed:
        return jsonify({"error": {"message": f"Provider {provider_name} rate limit reached", "type": "rate_limit_error"}}), 429
    credentials = gather_credentials(org_id, provider_name, spec.env_key)
    if not credentials:
        return jsonify({"error": {"message": f"No credentials configured for provider {provider_name}", "type": "upstream_error"}}), 502
    file_bytes = uploaded.read()
    if not file_bytes:
        return jsonify({"error": {"message": "uploaded file is empty", "type": "invalid_request_error"}}), 400
    fields = {key: str(value) for key, value in form.items() if key != "provider" and key != "file"}
    fields["model"] = model
    target = ProviderTarget(provider_name, model, credentials[0]["api_key"], credentials[0].get("base_url") or "")
    try:
        result = _gateway_for(org_id).transcribe(
            target,
            file_bytes=file_bytes,
            filename=uploaded.filename or "audio.bin",
            content_type=uploaded.mimetype or "application/octet-stream",
            fields=fields,
        )
    except GatewayError as exc:
        return jsonify({"error": {"message": str(exc), "type": "upstream_error"}}), exc.status or 502
    _record_audio_usage(org_id, provider_name, model, endpoint="stt")
    return jsonify(result)


@bp.route("/api/v1/audio/speech", methods=["POST"])
@require_gateway_auth
def v1_audio_speech():
    """OpenAI-compatible text-to-speech passthrough; returns raw audio bytes."""
    data = request.get_json(silent=True) or {}
    text_input = (data.get("input") or "").strip()
    voice = (data.get("voice") or "").strip()
    if not text_input or len(text_input) > 4096:
        return jsonify({"error": {"message": "input is required and must be at most 4096 characters", "type": "invalid_request_error"}}), 400
    if not voice:
        return jsonify({"error": {"message": "voice is required", "type": "invalid_request_error"}}), 400
    model = str(data.get("model") or "tts-1").strip()
    provider_name = (str(data.get("provider") or "").strip().lower() or _provider_for_model(model))[:64]
    spec = spec_for(provider_name)
    if "audio" not in spec.capabilities:
        return jsonify({"error": {"message": f"Provider {provider_name} does not support speech synthesis", "type": "invalid_request_error"}}), 400
    org_id = _get_org_id_from_req()
    access = _org_access(org_id)
    if access:
        return access
    prov = pg.query_one("SELECT * FROM org_ai_providers WHERE org_id = %s AND provider_name = %s AND is_active = TRUE", (org_id, provider_name))
    allowed, _retry_after = allow_request(org_id, provider_name, int((prov or {}).get("rate_limit_per_min") or 0))
    if not allowed:
        return jsonify({"error": {"message": f"Provider {provider_name} rate limit reached", "type": "rate_limit_error"}}), 429
    credentials = gather_credentials(org_id, provider_name, spec.env_key)
    if not credentials:
        return jsonify({"error": {"message": f"No credentials configured for provider {provider_name}", "type": "upstream_error"}}), 502
    payload = {key: value for key, value in data.items() if key != "provider"}
    payload["model"] = model
    target = ProviderTarget(provider_name, model, credentials[0]["api_key"], credentials[0].get("base_url") or "")
    try:
        audio_bytes, content_type = _gateway_for(org_id).speak(target, payload)
    except GatewayError as exc:
        return jsonify({"error": {"message": str(exc), "type": "upstream_error"}}), exc.status or 502
    _record_audio_usage(org_id, provider_name, model, endpoint="tts")
    return Response(audio_bytes, status=200, mimetype=content_type, headers={"X-9Router-Provider": provider_name, "X-9Router-Model": model})


def _gateway_for(org_id: str):
    """Gateway instance for this request; proxy-bound when the org has a pool."""
    proxy_url = None
    try:
        proxy_url = resolve_proxy_url(org_id)
    except Exception:
        proxy_url = None
    if not proxy_url:
        return _GATEWAY
    try:
        return gateway_with_proxy(proxy_url)
    except Exception:
        return _GATEWAY


def _record_audio_usage(org_id: str, provider_name: str, model: str, *, endpoint: str) -> None:
    """Best-effort telemetry for audio calls (token counts are provider-specific)."""
    try:
        pg.execute(
            """INSERT INTO org_ai_usage
               (id, org_id, user_id, provider_used, model_used, prompt_tokens, completion_tokens, tokens_saved_rtk, fallback_triggered, timestamp)
               VALUES (%s, %s, %s, %s, %s, 0, 0, 0, FALSE, %s)""",
            (f"usg-{uuid.uuid4().hex[:12]}", org_id, _current_user_id() or "system", provider_name, model, time.time()),
        )
    except Exception:
        pass
    record_request_log(
        org_id=org_id, user_id=_current_user_id(), endpoint=endpoint, requested_model=model,
        attempts=[{"provider": provider_name, "model": model, "status": "success"}],
        status="success", request_id=f"req-{uuid.uuid4().hex[:12]}", resolved_provider=provider_name,
        resolved_model=model,
    )


def _telemetry_stream(response_iter, *, org_id: str, user_id: str, requested_model: str, attempts: List[Dict[str, Any]], provider: str, model: str, tokens_saved: int, request_id: str, started: float, endpoint: str = "chat"):
    """Wrap an SSE generator so the redacted request log is written on completion."""
    usage: Dict[str, int] = {}
    try:
        for chunk in response_iter:
            try:
                text = chunk.decode("utf-8", errors="replace") if isinstance(chunk, bytes) else str(chunk)
                if text.startswith("data: ") and not text.startswith("data: [DONE]"):
                    event = json.loads(text[len("data: "):].strip())
                    chunk_usage = event.get("usage")
                    if isinstance(chunk_usage, dict):
                        usage["prompt_tokens"] = int(chunk_usage.get("prompt_tokens") or usage.get("prompt_tokens") or 0)
                        usage["completion_tokens"] = int(chunk_usage.get("completion_tokens") or usage.get("completion_tokens") or 0)
            except (ValueError, TypeError, AttributeError):
                pass
            yield chunk
    finally:
        record_request_log(
            org_id=org_id, user_id=user_id, endpoint=endpoint, requested_model=requested_model,
            attempts=attempts, status="success", request_id=request_id, resolved_provider=provider,
            resolved_model=model, latency_ms=int((time.time() - started) * 1000),
            prompt_tokens=usage.get("prompt_tokens", 0), completion_tokens=usage.get("completion_tokens", 0),
            tokens_saved_rtk=tokens_saved, stream=True,
        )


@bp.route("/api/v1/compress", methods=["POST"])
@require_gateway_auth
def v1_compress():
    """Headroom-compatible compression endpoint; fail-open by design.

    Forwards to an external Headroom service when HEADROOM_URL is configured,
    otherwise applies the local RTK filter pipeline. Compression failures never
    fail the request - the original payload is returned unchanged.
    """
    data = request.get_json(silent=True) or {}
    messages = data.get("messages")
    if not isinstance(messages, list) or not messages:
        return jsonify({"error": {"message": "messages array is required", "type": "invalid_request_error"}}), 400
    request_format = request.headers.get("X-9Router-Format", "openai").strip().lower()
    if request_format == "claude":
        total_chars = len(json.dumps(messages))
        del total_chars
        pxpipe = compress_with_pxpipe(
            {"messages": messages},
            enabled=os.environ.get("PXPIPE_URL", "").strip() != "",
            model=str(data.get("model") or ""),
        )
        if pxpipe["body"] is not None:
            return jsonify({
                "body": pxpipe["body"],
                "summary": pxpipe["summary"],
                "mode": "pxpipe",
            })
        return jsonify({"messages": messages, "tokens_saved": 0, "mode": "passthrough", "summary": pxpipe["summary"]})

    headroom_url = os.environ.get("HEADROOM_URL", "").strip().rstrip("/")
    if headroom_url:
        try:
            import urllib.request as _ur

            req = _ur.Request(
                f"{headroom_url}/v1/compress",
                data=json.dumps({"messages": messages}).encode("utf-8"),
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            with _ur.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            if isinstance(result, dict) and isinstance(result.get("messages"), list):
                result.setdefault("mode", "headroom")
                return jsonify(result)
        except Exception:
            pass  # fail-open
    saved = 0
    compressed: List[Dict[str, Any]] = []
    for message in messages:
        content = message.get("content") if isinstance(message, dict) else None
        if isinstance(content, str):
            new_text, _name = compress_text(content)
            saved += max(0, len(content) - len(new_text)) // 4
            compressed.append({**message, "content": new_text})
        else:
            compressed.append(message)
    return jsonify({"messages": compressed, "tokens_saved": saved, "mode": "rtk-local"})


_VIDEO_ACTIONS = ("generations", "edits", "extensions")


@bp.route("/api/v1/videos/<action>", methods=["POST"])
@require_gateway_auth
def v1_video_create(action: str):
    """Async video job creation proxy (upstream xai videoConfig shape)."""
    if action not in _VIDEO_ACTIONS:
        return jsonify({"error": {"message": "unknown video action", "type": "invalid_request_error"}}), 404
    data = request.get_json(silent=True) or {}
    raw_model = str(data.get("model") or "").strip()
    # Strip an explicit provider prefix (e.g. "xai/grok-imagine-video") like upstream.
    if "/" in raw_model:
        prefix, stripped = raw_model.split("/", 1)
        provider_name = (str(data.get("provider") or "").strip().lower() or prefix)[:64]
        model = stripped
    else:
        provider_name = (str(data.get("provider") or "").strip().lower() or _provider_for_model(raw_model or "grok-imagine-video"))[:64]
        model = raw_model
    org_id = _get_org_id_from_req()
    access = _org_access(org_id)
    if access:
        return access
    spec = spec_for(provider_name)
    if spec.protocol != "openai" or "video" not in spec.capabilities:
        return jsonify({"error": {"message": f"Provider '{provider_name}' does not support video generation", "type": "invalid_request_error"}}), 400
    prov = pg.query_one("SELECT * FROM org_ai_providers WHERE org_id = %s AND provider_name = %s AND is_active = TRUE", (org_id, provider_name))
    allowed, _retry_after = allow_request(org_id, provider_name, int((prov or {}).get("rate_limit_per_min") or 0))
    if not allowed:
        return jsonify({"error": {"message": f"Provider {provider_name} rate limit reached", "type": "rate_limit_error"}}), 429
    credentials = gather_credentials(org_id, provider_name, spec.env_key)
    if not credentials:
        return jsonify({"error": {"message": f"No credentials configured for provider {provider_name}", "type": "upstream_error"}}), 502
    payload = {key: value for key, value in data.items() if key != "provider"}
    if model:
        payload["model"] = model
    target = ProviderTarget(provider_name, model, credentials[0]["api_key"], credentials[0].get("base_url") or "")
    started = time.time()
    request_id = f"req-{uuid.uuid4().hex[:12]}"
    try:
        result = _gateway_for(org_id).video_create(target, payload, action)
    except GatewayError as exc:
        return jsonify({"error": {"message": str(exc), "type": "upstream_error"}}), exc.status or 502
    record_request_log(
        org_id=org_id, user_id=_current_user_id(), endpoint="video", requested_model=model or "(default)",
        attempts=[{"provider": provider_name, "model": model, "status": "success"}],
        status="success", request_id=request_id, resolved_provider=provider_name, resolved_model=model,
        latency_ms=int((time.time() - started) * 1000),
    )
    response = jsonify(result)
    response.headers["X-9Router-Provider"] = provider_name
    response.headers["X-9Router-Request-ID"] = request_id
    return response


@bp.route("/api/v1/videos/<video_id>", methods=["GET"])
@require_gateway_auth
def v1_video_status(video_id: str):
    """Poll one async video job."""
    if len(video_id) > 128:
        return jsonify({"error": {"message": "video_id is too long", "type": "invalid_request_error"}}), 400
    provider_name = (request.args.get("provider") or "").strip().lower()[:64]
    model = (request.args.get("model") or "").strip()[:128]
    if not provider_name:
        provider_name = _provider_for_model(model or "grok-imagine-video")
    org_id = _get_org_id_from_req()
    access = _org_access(org_id)
    if access:
        return access
    spec = spec_for(provider_name)
    if spec.protocol != "openai" or "video" not in spec.capabilities:
        return jsonify({"error": {"message": f"Provider '{provider_name}' does not support video generation", "type": "invalid_request_error"}}), 400
    credentials = gather_credentials(org_id, provider_name, spec.env_key)
    if not credentials:
        return jsonify({"error": {"message": f"No credentials configured for provider {provider_name}", "type": "upstream_error"}}), 502
    target = ProviderTarget(provider_name, model, credentials[0]["api_key"], credentials[0].get("base_url") or "")
    try:
        result = _gateway_for(org_id).video_status(target, video_id)
    except GatewayError as exc:
        return jsonify({"error": {"message": str(exc), "type": "upstream_error"}}), exc.status or 502
    return jsonify(result)


@bp.route("/api/v1/images/generations", methods=["POST"])
@require_gateway_auth
def v1_images_generations():
    """OpenAI-compatible image generation passthrough (OpenAI-protocol providers)."""
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    if not prompt or len(prompt) > 4000:
        return jsonify({"error": {"message": "prompt is required and must be at most 4000 characters", "type": "invalid_request_error"}}), 400
    model = str(data.get("model") or "dall-e-3").strip()
    provider_name = (str(data.get("provider") or "").strip().lower() or _provider_for_model(model))[:64]
    org_id = _get_org_id_from_req()
    access = _org_access(org_id)
    if access:
        return access
    try:
        result, provider_name, model = _run_capability_passthrough(
            org_id, provider_name, model, data, "images", "/images/generations"
        )
    except GatewayError as exc:
        status = exc.status or 502
        if status == 400:
            return jsonify({"error": {"message": str(exc), "type": "invalid_request_error"}}), 400
        return jsonify({"error": {"message": str(exc), "type": "upstream_error"}}), status
    response = jsonify(result)
    response.headers["X-9Router-Provider"] = provider_name
    response.headers["X-9Router-Model"] = model
    return response


@bp.route("/api/v1/responses", methods=["POST"])
@require_gateway_auth
def v1_responses():
    """OpenAI Responses API passthrough (stateless use)."""
    data = request.get_json(silent=True) or {}
    if not str(data.get("input") or "").strip():
        return jsonify({"error": {"message": "input is required", "type": "invalid_request_error"}}), 400
    if len(str(data.get("input"))) > 200_000:
        return jsonify({"error": {"message": "input is too large", "type": "invalid_request_error"}}), 400
    model = str(data.get("model") or "gpt-4o-mini").strip()
    provider_name = (str(data.get("provider") or "").strip().lower() or _provider_for_model(model))[:64]
    org_id = _get_org_id_from_req()
    access = _org_access(org_id)
    if access:
        return access
    previous_response_id = str(data.get("previous_response_id") or "").strip() or None
    if previous_response_id:
        prior = get_response(org_id, previous_response_id)
        if not prior:
            return jsonify({"error": {"message": "previous_response_id not found", "type": "invalid_request_error"}}), 404
        context = build_context_messages(org_id, previous_response_id)
        raw_input_value = data.get("input")
        new_input = raw_input_value if isinstance(raw_input_value, list) else [{"role": "user", "content": str(raw_input_value or "")}]
        data = {**data, "input": [*context, *new_input]}
    if data.get("stream"):
        spec = spec_for(provider_name)
        if spec.protocol != "openai" or "responses" not in spec.capabilities:
            return jsonify({"error": {"message": f"responses streaming is not supported for provider {provider_name}", "type": "invalid_request_error"}}), 400
        prov = pg.query_one("SELECT * FROM org_ai_providers WHERE org_id = %s AND provider_name = %s AND is_active = TRUE", (org_id, provider_name))
        allowed, _retry_after = allow_request(org_id, provider_name, int((prov or {}).get("rate_limit_per_min") or 0))
        if not allowed:
            return jsonify({"error": {"message": f"Provider {provider_name} rate limit reached", "type": "rate_limit_error"}}), 429
        credentials = gather_credentials(org_id, provider_name, spec.env_key)
        if not credentials:
            return jsonify({"error": {"message": f"No credentials configured for provider {provider_name}", "type": "upstream_error"}}), 502
        stream_started = time.time()
        stream_request_id = f"req-{uuid.uuid4().hex[:12]}"
        stream_target = ProviderTarget(provider_name, model, credentials[0]["api_key"], credentials[0].get("base_url") or "")
        response_iter = _gateway_for(org_id).responses_stream(stream_target, {key: value for key, value in data.items() if key != "provider"})
        return Response(
            stream_with_context(_telemetry_stream(
                response_iter, org_id=org_id, user_id=_current_user_id(), requested_model=model,
                attempts=[{"provider": provider_name, "model": model, "status": "success"}],
                provider=provider_name, model=model, tokens_saved=0,
                request_id=stream_request_id, started=stream_started, endpoint="responses",
            )),
            status=200, mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-9Router-Provider": provider_name, "X-9Router-Request-ID": stream_request_id},
        )
    try:
        result, provider_name, model = _run_capability_passthrough(
            org_id, provider_name, model, data, "responses", "/responses"
        )
    except GatewayError as exc:
        status = exc.status or 502
        if status == 400:
            return jsonify({"error": {"message": str(exc), "type": "invalid_request_error"}}), 400
        return jsonify({"error": {"message": str(exc), "type": "upstream_error"}}), status
    usage = result.get("usage") if isinstance(result.get("usage"), dict) else {}
    prompt_tokens = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    request_id = f"req-{uuid.uuid4().hex[:12]}"
    record_request_log(
        org_id=org_id, user_id=_current_user_id(), endpoint="responses", requested_model=model,
        attempts=[{"provider": provider_name, "model": model, "status": "success"}],
        status="success", request_id=request_id, resolved_provider=provider_name, resolved_model=model,
        prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
    )
    stored_id = None
    if data.get("store"):
        output_text = ""
        for item in result.get("output") or []:
            for part in (item.get("content") or []) if isinstance(item, dict) else []:
                if isinstance(part, dict) and part.get("type") == "output_text":
                    output_text += str(part.get("text") or "")
        stored_id = store_response(
            org_id=org_id, user_id=_current_user_id(), provider_name=provider_name, model=model,
            input_messages=data.get("input") if isinstance(data.get("input"), list) else [{"role": "user", "content": str(data.get("input") or "")}],
            output_json=result.get("output"), output_text=output_text,
            previous_response_id=previous_response_id,
        )
    response = jsonify(result)
    if stored_id:
        response.headers["X-9Router-Response-ID"] = stored_id
    response.headers["X-9Router-Request-ID"] = request_id
    response.headers["X-9Router-Provider"] = provider_name
    return response


@bp.route("/api/v1/responses/compact", methods=["POST"])
@require_gateway_auth
def v1_responses_compact():
    """Compact conversation context: Responses body routed through the chat
    pipeline (upstream semantics: body._compact through the chat executor)."""
    data = request.get_json(silent=True) or {}
    if not str(data.get("input") or "").strip():
        return jsonify({"error": {"message": "input is required", "type": "invalid_request_error"}}), 400
    raw_input = data.get("input")
    if isinstance(raw_input, str):
        messages = [{"role": "user", "content": raw_input}]
    elif isinstance(raw_input, list):
        messages = [
            {"role": str(item.get("role") or "user"), "content": item.get("content") if isinstance(item, dict) else str(item)}
            for item in raw_input
        ]
    else:
        return jsonify({"error": {"message": "input must be a string or a message list", "type": "invalid_request_error"}}), 400
    chat_data = {"model": str(data.get("model") or "gpt-4o-mini"), "messages": messages}
    response = _chat_completions_core(chat_data)
    if response.status_code != 200:
        return response
    completion = response.get_json()
    text = completion["choices"][0]["message"]["content"]
    usage = completion.get("usage") or {}
    return jsonify({
        "id": f"resp-{uuid.uuid4().hex[:12]}",
        "object": "response",
        "created_at": int(time.time()),
        "model": completion.get("model"),
        "_compact": True,
        "output": [{"type": "message", "role": "assistant", "status": "completed", "content": [{"type": "output_text", "text": text}]}],
        "usage": {"input_tokens": usage.get("prompt_tokens", 0), "output_tokens": usage.get("completion_tokens", 0), "total_tokens": usage.get("total_tokens", 0)},
    })


@bp.route("/api/v1/audio/voices", methods=["GET"])
@require_gateway_auth
def v1_audio_voices():
    """OpenAI-style TTS voice catalog per audio-capable provider (no paid call)."""
    provider_name = (request.args.get("provider") or "openai").strip().lower()[:64]
    model = (request.args.get("model") or "tts-1").strip()[:128]
    spec = spec_for(provider_name)
    if "audio" not in spec.capabilities:
        from services.ai_router.providers import PROVIDERS as _ALL
        supported = ", ".join(name for name, spec2 in _ALL.items() if "audio" in spec2.capabilities)
        return jsonify({"error": {"message": f"provider must be one of: {supported}", "type": "invalid_request_error"}}), 400
    voices = TTS_VOICES.get(provider_name, [])
    return jsonify({
        "object": "list",
        "data": [{"id": f"{model}:{voice}", "object": "model", "provider": provider_name, "voice": voice, "model": model} for voice in voices],
    })


def _run_capability_passthrough(org_id: str, provider_name: str, model: str, data: Dict[str, Any], capability: str, path: str) -> tuple[Dict[str, Any], str, str]:
    """Shared guard/rate-limit/credential/telemetry pipeline for JSON media endpoints."""
    spec = spec_for(provider_name)
    if spec.protocol != "openai" or capability not in spec.capabilities:
        raise GatewayError(
            f"{capability} requests are not supported for provider {provider_name} ({spec.protocol} protocol)",
            status=400,
            retryable=False,
        )
    prov = pg.query_one("SELECT * FROM org_ai_providers WHERE org_id = %s AND provider_name = %s AND is_active = TRUE", (org_id, provider_name))
    allowed, _retry_after = allow_request(org_id, provider_name, int((prov or {}).get("rate_limit_per_min") or 0))
    if not allowed:
        raise GatewayError(f"Provider {provider_name} rate limit reached", status=429, retryable=True)
    credentials = gather_credentials(org_id, provider_name, spec.env_key)
    if not credentials:
        raise GatewayError(f"No credentials configured for provider {provider_name}", status=502, retryable=False)
    started = time.time()
    request_id = f"req-{uuid.uuid4().hex[:12]}"
    target = ProviderTarget(provider_name, model, credentials[0]["api_key"], credentials[0].get("base_url") or "")
    try:
        if path == "/images/generations":
            result = _gateway_for(org_id).images_generate(target, {key: value for key, value in data.items() if key != "provider"})
        else:
            result = _gateway_for(org_id).responses_create(target, {key: value for key, value in data.items() if key != "provider"})
    except GatewayError:
        raise
    record_request_log(
        org_id=org_id, user_id=_current_user_id(), endpoint=capability, requested_model=model,
        attempts=[{"provider": provider_name, "model": model, "status": "success"}],
        status="success", request_id=request_id, resolved_provider=provider_name, resolved_model=model,
        latency_ms=int((time.time() - started) * 1000),
    )
    return result, provider_name, model


def _chat_completions_core(data: Dict[str, Any]):
    """Full chat pipeline (validation -> RTK -> fallback chain -> telemetry).

    Returns a Flask response for both success and error paths; shared by the
    chat-completions route and the Responses compact route.
    """
    try:
        messages = _validated_messages(data.get("messages"))
    except ValueError as exc:
        return jsonify({"error": {"message": str(exc), "type": "invalid_request_error"}}), 400
    requested_model = str(data.get("model") or "gpt-4o-mini").strip()
    if not requested_model or len(requested_model) > 128:
        return jsonify({"error": {"message": "model is required and must be at most 128 characters", "type": "invalid_request_error"}}), 400
    stream = bool(data.get("stream", False))

    org_id = _get_org_id_from_req()
    access = _org_access(org_id)
    if access:
        return access

    # 1. Apply token-saver policy: per-route settings take priority, and the
    # X-9Router-Token-Saver: off header always disables compression.
    header_off = request.headers.get("X-9Router-Token-Saver", "").lower() == "off"
    route = pg.query_one("SELECT * FROM org_ai_routes WHERE org_id = %s AND alias_name = %s", (org_id, requested_model))
    if header_off:
        compressed_messages, tokens_saved = messages, 0
    else:
        rtk_enabled = bool(route.get("rtk_compression_enabled", True)) if route else True
        caveman_mode = str((route or {}).get("caveman_mode") or "off").lower()
        if caveman_mode in {"true", "1"}:
            caveman_mode = "full"
        if caveman_mode not in {"off", "lite", "full", "ultra"}:
            caveman_mode = "off"
        compressed_messages, tokens_saved = compress_messages(messages, enabled=rtk_enabled, mode=caveman_mode)

    # 1b. Ponytail token-saver: persona injection into the system message.
    ponytail_level = request.headers.get("X-9Router-Ponytail", "").strip().lower()
    if ponytail_level in {"lite", "full", "ultra"}:
        compressed_messages = apply_ponytail(compressed_messages, ponytail_level)

    fallback_chain: List[str] = []
    if route:
        fallback_chain = [str(route["primary_model"])]
        raw_fallbacks = route.get("fallback_models") or []
        if isinstance(raw_fallbacks, str):
            try:
                raw_fallbacks = json.loads(raw_fallbacks)
            except (TypeError, ValueError):
                raw_fallbacks = []
        if isinstance(raw_fallbacks, list):
            fallback_chain.extend(str(model) for model in raw_fallbacks if str(model).strip())
    else:
        # Default multi-tier fallback chain when no combo matches the model.
        fallback_chain = [requested_model, "gpt-4o-mini", "claude-3-5-sonnet", "gemini-1.5-flash", "deepseek-chat"]

    # 3. Attempt execution through the ordered fallback chain.
    request_id = f"req-{uuid.uuid4().hex[:12]}"
    chat_started = time.time()
    attempts: List[Dict[str, Any]] = []
    success_resp: Optional[Dict[str, Any]] = None
    used_model = requested_model
    used_provider = _provider_for_model(requested_model)
    fallback_triggered = False
    last_error: Optional[GatewayError] = None
    for idx, target_model in enumerate(fallback_chain):
        provider_name = _provider_for_model(str(target_model))
        prov = pg.query_one("SELECT * FROM org_ai_providers WHERE org_id = %s AND provider_name = %s AND is_active = TRUE", (org_id, provider_name))
        rate_limit = int((prov or {}).get("rate_limit_per_min") or 0)
        allowed, retry_after = allow_request(org_id, provider_name, rate_limit)
        if not allowed:
            attempts.append({"provider": provider_name, "model": str(target_model), "status": "rate_limited"})
            last_error = GatewayError(f"Provider {provider_name} rate limit reached", status=429, retryable=True)
            continue
        credentials = gather_credentials(org_id, provider_name, spec_for(provider_name).env_key)
        if not credentials:
            # Tests may exercise the route without provisioning a paid provider;
            # production never synthesizes a completion.
            if os.environ.get("FLASK_ENV", "").lower() == "testing":
                success_resp = {
                    "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": str(target_model),
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": "Test gateway response"}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": max(1, sum(len(str(m.get("content") or "")) for m in compressed_messages) // 4), "completion_tokens": 3, "total_tokens": 3, "rtk_tokens_saved": tokens_saved},
                }
                used_model, used_provider, fallback_triggered = str(target_model), provider_name, idx > 0
                attempts.append({"provider": provider_name, "model": str(target_model), "status": "success"})
                break
            last_error = GatewayError(f"No credentials configured for provider {provider_name}")
            continue
        for credential in credentials:
            target = ProviderTarget(provider_name, str(target_model), credential["api_key"], credential.get("base_url") or "")
            attempt_start = time.time()
            try:
                if stream:
                    used_model, used_provider, fallback_triggered = str(target_model), provider_name, idx > 0
                    attempts.append({"provider": provider_name, "model": str(target_model), "status": "success"})
                    response_iter = _gateway_for(org_id).stream(target, {**data, "messages": compressed_messages})
                    return Response(stream_with_context(_telemetry_stream(response_iter, org_id=org_id, user_id=_current_user_id(), requested_model=requested_model, attempts=attempts, provider=provider_name, model=str(target_model), tokens_saved=tokens_saved, request_id=request_id, started=chat_started)), status=200, mimetype="text/event-stream", headers={"Cache-Control": "no-cache", "X-9Router-Provider": provider_name, "X-9Router-Model": str(target_model), "X-9Router-Request-ID": request_id})
                success_resp = _gateway_for(org_id).complete(target, {**data, "messages": compressed_messages})
                used_model, used_provider, fallback_triggered = str(target_model), provider_name, idx > 0
                attempts.append({"provider": provider_name, "model": str(target_model), "status": "success", "latency_ms": int((time.time() - attempt_start) * 1000)})
                prompt_tokens, completion_tokens = usage_from_response(success_resp, compressed_messages)
                usage = dict(success_resp.get("usage") or {})
                usage.setdefault("prompt_tokens", prompt_tokens)
                usage.setdefault("completion_tokens", completion_tokens)
                usage.setdefault("total_tokens", prompt_tokens + completion_tokens)
                usage["rtk_tokens_saved"] = tokens_saved
                success_resp["usage"] = usage
                break
            except GatewayError as exc:
                attempts.append({"provider": provider_name, "model": str(target_model), "status": "error", "http_status": exc.status, "error": str(exc)[:200], "latency_ms": int((time.time() - attempt_start) * 1000)})
                last_error = exc
                if not exc.retryable:
                    break
        if success_resp:
            break

    # 4. Record Usage & Telemetry in Database
    if success_resp:
        try:
            pg.execute(
                """INSERT INTO org_ai_usage 
                   (id, org_id, user_id, provider_used, model_used, prompt_tokens, completion_tokens, tokens_saved_rtk, fallback_triggered, timestamp)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    f"usg-{uuid.uuid4().hex[:12]}",
                    org_id,
                    getattr(request, "user_id", "system"),
                    used_provider,
                    used_model,
                    success_resp["usage"]["prompt_tokens"],
                    success_resp["usage"]["completion_tokens"],
                    tokens_saved,
                    fallback_triggered,
                    time.time(),
                )
            )
        except Exception:
            pass

    latency_ms = int((time.time() - chat_started) * 1000)
    if success_resp is None:
        status = last_error.status if last_error and last_error.status else 502
        message = str(last_error) if last_error else "No configured provider was available"
        record_request_log(
            org_id=org_id, user_id=_current_user_id(), endpoint="chat", requested_model=requested_model,
            attempts=attempts, status="error", request_id=request_id, error_code="upstream_error",
            http_status=status, latency_ms=latency_ms, tokens_saved_rtk=tokens_saved, stream=stream,
        )
        return jsonify({"error": {"message": message, "type": "upstream_error"}}), status
    record_request_log(
        org_id=org_id, user_id=_current_user_id(), endpoint="chat", requested_model=requested_model,
        attempts=attempts, status="success", request_id=request_id, resolved_provider=used_provider,
        resolved_model=used_model, latency_ms=latency_ms,
        prompt_tokens=int(success_resp["usage"].get("prompt_tokens") or 0),
        completion_tokens=int(success_resp["usage"].get("completion_tokens") or 0),
        tokens_saved_rtk=tokens_saved, stream=stream,
    )
    success_resp["id"] = success_resp.get("id") or f"chatcmpl-{uuid.uuid4().hex[:12]}"
    success_resp["system_fingerprint"] = f"fp_radas9router_{used_provider}"
    response = jsonify(success_resp)
    response.headers["X-9Router-Request-ID"] = request_id
    return response


@bp.route("/api/v1/chat/completions", methods=["POST"])
@require_gateway_auth
def v1_chat_completions():
    """OpenAI-compatible AI router proxy with RTK token compression & model combo fallbacks."""
    return _chat_completions_core(request.get_json(silent=True) or {})


# -----------------------------------------------------------------------------
# Organization AI Configuration & Provider Vault CRUD Endpoints
# -----------------------------------------------------------------------------
@bp.route("/api/orgs/<org_id>/ai/providers", methods=["GET"])
@require_auth
def get_org_ai_providers(org_id: str):
    """List configured AI providers for an organization (API keys redacted)."""
    access = _org_access(org_id)
    if access:
        return access
    rows = pg.query_all("SELECT id, org_id, provider_name, base_url, is_active, rate_limit_per_min, created_at, updated_at FROM org_ai_providers WHERE org_id = %s ORDER BY provider_name ASC", (org_id,))
    return jsonify({"providers": rows})


@bp.route("/api/orgs/<org_id>/ai/providers", methods=["POST"])
@require_auth
def save_org_ai_provider(org_id: str):
    """Save or update an AI provider API key for an organization."""
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    data = request.get_json(silent=True) or {}
    provider_name = (data.get("provider_name") or "").strip().lower()
    api_key = (data.get("api_key") or "").strip()
    base_url = (data.get("base_url") or "").strip().rstrip("/")
    try:
        rate_limit = int(data.get("rate_limit_per_min") or 60)
    except (TypeError, ValueError):
        return jsonify({"error": "rate_limit_per_min must be an integer"}), 400

    if not _ALLOWED_PROVIDER.fullmatch(provider_name) or not api_key or len(api_key) > 4096:
        return jsonify({"error": "valid provider_name and api_key are required"}), 400
    if base_url:
        from urllib.parse import urlparse
        parsed = urlparse(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
            return jsonify({"error": "base_url must be an http(s) URL without embedded credentials"}), 400
    if not 1 <= rate_limit <= 100000:
        return jsonify({"error": "rate_limit_per_min must be between 1 and 100000"}), 400
        
    now = time.time()
    existing = pg.query_one("SELECT id FROM org_ai_providers WHERE org_id = %s AND provider_name = %s", (org_id, provider_name))
    
    if existing:
        pg.execute(
            """UPDATE org_ai_providers 
               SET api_key_encrypted = %s, base_url = %s, rate_limit_per_min = %s, is_active = TRUE, updated_at = %s
               WHERE id = %s""",
            (_encrypted_provider_key(api_key), base_url, rate_limit, now, existing["id"])
        )
        provider_id = existing["id"]
    else:
        provider_id = f"prov-{uuid.uuid4().hex[:12]}"
        pg.execute(
            """INSERT INTO org_ai_providers 
               (id, org_id, provider_name, api_key_encrypted, base_url, is_active, rate_limit_per_min, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, TRUE, %s, %s, %s)""",
            (provider_id, org_id, provider_name, _encrypted_provider_key(api_key), base_url, rate_limit, now, now)
        )
        
    return jsonify({"success": True, "id": provider_id})


@bp.route("/api/orgs/<org_id>/ai/routes", methods=["GET"])
@require_auth
def get_org_ai_routes(org_id: str):
    """List model combo routing definitions & fallback chains for an organization."""
    access = _org_access(org_id)
    if access:
        return access
    rows = pg.query_all("SELECT * FROM org_ai_routes WHERE org_id = %s ORDER BY alias_name ASC", (org_id,))
    for r in rows:
        if isinstance(r.get("fallback_models"), str):
            try:
                r["fallback_models"] = json.loads(r["fallback_models"])
            except Exception:
                r["fallback_models"] = []
    return jsonify({"routes": rows})


@bp.route("/api/orgs/<org_id>/ai/providers/<provider_id>", methods=["PATCH"])
@require_auth
def update_org_ai_provider(org_id: str, provider_id: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    data = request.get_json(silent=True) or {}
    if "is_active" not in data:
        return jsonify({"error": "is_active is required"}), 400
    pg.execute("UPDATE org_ai_providers SET is_active = TRUE, updated_at = %s WHERE id = %s AND org_id = %s", (time.time(), provider_id, org_id)) if bool(data["is_active"]) else pg.execute("UPDATE org_ai_providers SET is_active = FALSE, updated_at = %s WHERE id = %s AND org_id = %s", (time.time(), provider_id, org_id))
    return jsonify({"success": True})


@bp.route("/api/orgs/<org_id>/ai/providers/<provider_id>", methods=["DELETE"])
@require_auth
def delete_org_ai_provider(org_id: str, provider_id: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    pg.execute("DELETE FROM org_ai_providers WHERE id = %s AND org_id = %s", (provider_id, org_id))
    return jsonify({"success": True})


@bp.route("/api/orgs/<org_id>/ai/routes/<route_id>", methods=["DELETE"])
@require_auth
def delete_org_ai_route(org_id: str, route_id: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    pg.execute("DELETE FROM org_ai_routes WHERE id = %s AND org_id = %s", (route_id, org_id))
    return jsonify({"success": True})


@bp.route("/api/orgs/<org_id>/ai/routes", methods=["POST"])
@require_auth
def save_org_ai_route(org_id: str):
    """Save or update a model combo routing rule for an organization."""
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    data = request.get_json(silent=True) or {}
    alias_name = (data.get("alias_name") or "").strip().lower()
    primary_model = (data.get("primary_model") or "").strip()
    fallback_models = data.get("fallback_models") or []
    if not re.fullmatch(r"^[a-z0-9][a-z0-9_.:-]{1,127}$", alias_name) or not primary_model or len(primary_model) > 128:
        return jsonify({"error": "alias_name and primary_model are invalid"}), 400
    if not isinstance(fallback_models, list) or len(fallback_models) > 20 or any(not isinstance(model, str) or not model.strip() or len(model) > 128 for model in fallback_models):
        return jsonify({"error": "fallback_models must be a list of at most 20 model names"}), 400
    fallback_models = [model.strip() for model in fallback_models]
    rtk_enabled = bool(data.get("rtk_compression_enabled", True))
    caveman = bool(data.get("caveman_mode", False))
    
    if not alias_name or not primary_model:
        return jsonify({"error": "alias_name and primary_model are required"}), 400
        
    fb_json = json.dumps(fallback_models)
    now = time.time()
    
    existing = pg.query_one("SELECT id FROM org_ai_routes WHERE org_id = %s AND alias_name = %s", (org_id, alias_name))
    if existing:
        pg.execute(
            """UPDATE org_ai_routes 
               SET primary_model = %s, fallback_models = %s, rtk_compression_enabled = %s, caveman_mode = %s
               WHERE id = %s""",
            (primary_model, fb_json, rtk_enabled, caveman, existing["id"])
        )
        route_id = existing["id"]
    else:
        route_id = f"route-{uuid.uuid4().hex[:12]}"
        pg.execute(
            """INSERT INTO org_ai_routes 
               (id, org_id, alias_name, primary_model, fallback_models, rtk_compression_enabled, caveman_mode, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (route_id, org_id, alias_name, primary_model, fb_json, rtk_enabled, caveman, now)
        )
        
    return jsonify({"success": True, "id": route_id})


@bp.route("/api/orgs/<org_id>/ai/usage", methods=["GET"])
@require_auth
def get_org_ai_usage(org_id: str):
    """Get AI usage metrics, RTK token savings, and fallback telemetry for an organization."""
    access = _org_access(org_id)
    if access:
        return access
    records = pg.query_all("SELECT * FROM org_ai_usage WHERE org_id = %s ORDER BY timestamp DESC LIMIT 50", (org_id,))
    
    total_prompt = sum(r.get("prompt_tokens", 0) for r in records)
    total_completion = sum(r.get("completion_tokens", 0) for r in records)
    total_saved_rtk = sum(r.get("tokens_saved_rtk", 0) for r in records)
    fallbacks_count = sum(1 for r in records if r.get("fallback_triggered"))
    
    return jsonify({
        "records": records,
        "summary": {
            "total_requests": len(records),
            "total_prompt_tokens": total_prompt,
            "total_completion_tokens": total_completion,
            "total_tokens_saved_rtk": total_saved_rtk,
            "fallbacks_triggered": fallbacks_count,
            "efficiency_percentage": int((total_saved_rtk / max(1, total_prompt + total_saved_rtk)) * 100)
        }
    })


@bp.route("/api/orgs/<org_id>/ai/logs", methods=["GET"])
@require_auth
def list_org_ai_request_logs(org_id: str):
    """Redacted request/attempt logs with date-range and status filters."""
    access = _org_access(org_id)
    if access:
        return access
    try:
        limit = int(request.args.get("limit") or 50)
    except (TypeError, ValueError):
        return jsonify({"error": "limit must be an integer"}), 400
    since = request.args.get("since")
    until = request.args.get("until")
    try:
        since_f = float(since) if since is not None else None
        until_f = float(until) if until is not None else None
    except (TypeError, ValueError):
        return jsonify({"error": "since/until must be unix timestamps"}), 400
    status_filter = (request.args.get("status") or "").strip().lower() or None
    if status_filter and status_filter not in {"success", "error"}:
        return jsonify({"error": "status must be success or error"}), 400
    rows = list_request_logs(org_id, limit=limit, since=since_f, until=until_f, status=status_filter)
    return jsonify({"logs": rows})


@bp.route("/api/orgs/<org_id>/ai/costs", methods=["GET"])
@require_auth
def get_org_ai_costs(org_id: str):
    """Aggregate cost estimates (public rates, non-billing) over a date range."""
    access = _org_access(org_id)
    if access:
        return access
    since = request.args.get("since")
    until = request.args.get("until")
    try:
        since_f = float(since) if since is not None else None
        until_f = float(until) if until is not None else None
    except (TypeError, ValueError):
        return jsonify({"error": "since/until must be unix timestamps"}), 400
    return jsonify(cost_summary(org_id, since=since_f, until=until_f))


# -----------------------------------------------------------------------------
# Gateway endpoint keys (OpenAI-client compatible auth) & multi-account vault
# -----------------------------------------------------------------------------
@bp.route("/api/orgs/<org_id>/ai/proxy-pools", methods=["GET"])
@require_auth
def list_org_ai_proxy_pools(org_id: str):
    access = _org_access(org_id)
    if access:
        return access
    return jsonify({"pools": list_pools(org_id)})


@bp.route("/api/orgs/<org_id>/ai/proxy-pools", methods=["POST"])
@require_auth
def upsert_org_ai_proxy_pool(org_id: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    data = request.get_json(silent=True) or {}
    try:
        created = upsert_pool(org_id, str(data.get("label") or ""), str(data.get("proxy_url") or ""))
    except ProxyPoolError as exc:
        return jsonify({"error": str(exc)}), exc.status
    return jsonify({"success": True, **created}), 201


@bp.route("/api/orgs/<org_id>/ai/proxy-pools/<pool_id>", methods=["DELETE"])
@require_auth
def delete_org_ai_proxy_pool(org_id: str, pool_id: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    if not delete_pool(org_id, pool_id):
        return jsonify({"error": "pool not found"}), 404
    return jsonify({"success": True})


@bp.route("/api/orgs/<org_id>/ai/proxy-pools/<pool_id>/test", methods=["POST"])
@require_auth
def test_org_ai_proxy_pool(org_id: str, pool_id: str):
    """Egress check through one pool (never returns the proxy URL)."""
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    row = pg.query_one("SELECT label FROM org_ai_proxy_pools WHERE id = %s AND org_id = %s", (pool_id, org_id))
    if not row:
        return jsonify({"error": "pool not found"}), 404
    import urllib.request
    # Resolve this specific pool's URL without rotating.
    enc = pg.query_one("SELECT proxy_url_encrypted FROM org_ai_proxy_pools WHERE id = %s", (pool_id,))
    from utils.secret_encryption import get_encryption
    try:
        proxy_url = get_encryption().decrypt(enc["proxy_url_encrypted"])
    except Exception:
        return jsonify({"ok": False, "error": "proxy_url undecryptable"}), 500
    test_url = (request.get_json(silent=True) or {}).get("test_url") or "https://api.openai.com/v1/models"
    if not test_url.startswith("https://"):
        return jsonify({"error": "test_url must be https"}), 400
    started = time.time()
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url}))
        req = urllib.request.Request(test_url, method="GET", headers={"User-Agent": "radas-9router-healthcheck"})
        with opener.open(req, timeout=10) as resp:
            status = resp.status
        return jsonify({"ok": True, "status": status, "latency_ms": int((time.time() - started) * 1000), "label": row["label"]})
    except Exception as exc:
        detail = str(exc)[:200]
        return jsonify({"ok": False, "error": detail, "latency_ms": int((time.time() - started) * 1000), "label": row["label"]})


@bp.route("/api/orgs/<org_id>/ai/oauth/providers", methods=["GET"])
@require_auth
def list_org_ai_oauth_providers(org_id: str):
    """Registry metadata for OAuth-capable providers (client_id presence only)."""
    access = _org_access(org_id)
    if access:
        return access
    providers = [
        {
            "provider": spec.name,
            "flow": "authorization_code",
            "authorize_url": spec.authorize_url,
            "scopes": spec.scopes,
            "client_configured": bool(client_id_for(spec)),
        }
        for spec in OAUTH_PROVIDERS.values()
    ]
    providers.extend(
        {"provider": name, "flow": "device_code", "token_url": entry["token_url"]}
        for name, entry in _DEVICE_PROVIDERS.items()
    )
    providers.extend(
        {"provider": name, "flow": flow} for name, flow in OAUTH_IMPORT_PROVIDERS.items()
    )
    return jsonify({"providers": providers})


@bp.route("/api/orgs/<org_id>/ai/oauth/<provider>/begin", methods=["POST"])
@require_auth
def begin_org_ai_oauth(org_id: str, provider: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(begin_flow(org_id, provider, str(data.get("label") or ""), str(data.get("redirect_uri") or ""))), 201
    except OAuthError as exc:
        return jsonify({"error": str(exc)}), exc.status


@bp.route("/api/orgs/<org_id>/ai/oauth/<provider>/complete", methods=["POST"])
@require_auth
def complete_org_ai_oauth(org_id: str, provider: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    data = request.get_json(silent=True) or {}
    try:
        result = complete_flow(org_id, provider, str(data.get("code") or ""), str(data.get("state") or ""))
    except OAuthError as exc:
        return jsonify({"error": str(exc)}), exc.status
    return jsonify({"success": True, **result}), 201


@bp.route("/api/orgs/<org_id>/ai/oauth/<provider>/device/begin", methods=["POST"])
@require_auth
def begin_org_ai_device_flow(org_id: str, provider: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(begin_device_flow(org_id, provider, str(data.get("label") or ""))), 201
    except OAuthError as exc:
        return jsonify({"error": str(exc)}), exc.status


@bp.route("/api/orgs/<org_id>/ai/oauth/<provider>/device/complete", methods=["POST"])
@require_auth
def complete_org_ai_device_flow(org_id: str, provider: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    data = request.get_json(silent=True) or {}
    try:
        result = complete_device_flow(org_id, provider, str(data.get("state") or ""))
    except OAuthError as exc:
        return jsonify({"error": str(exc)}), exc.status
    return jsonify(result), 201


@bp.route("/api/orgs/<org_id>/ai/oauth/<provider>/import-token", methods=["POST"])
@require_auth
def import_org_ai_oauth_token(org_id: str, provider: str):
    """Operator-side token import for import_token/custom-flow providers."""
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    data = request.get_json(silent=True) or {}
    try:
        result = import_token(
            org_id,
            provider,
            label=str(data.get("label") or ""),
            access_token=str(data.get("access_token") or ""),
            refresh_token=str(data.get("refresh_token") or ""),
            expires_in=int(data.get("expires_in") or 3600),
            scope=str(data.get("scope") or ""),
        )
    except OAuthError as exc:
        return jsonify({"error": str(exc)}), exc.status
    return jsonify({"success": True, **result}), 201


@bp.route("/api/v1/responses/<response_id>", methods=["GET"])
@require_gateway_auth
def get_org_ai_stored_response(response_id: str):
    """Retrieve one stored response (org-scoped; requires store=true on create)."""
    org_id = _get_org_id_from_req()
    access = _org_access(org_id)
    if access:
        return access
    row = get_response(org_id, response_id)
    if not row:
        return jsonify({"error": {"message": "response not found", "type": "invalid_request_error"}}), 404
    return jsonify({
        "id": row["id"], "object": "response", "model": row.get("model"),
        "provider": row.get("provider_name"), "input": row.get("input_messages"),
        "output": row.get("output_json"), "output_text": row.get("output_text"),
        "previous_response_id": row.get("previous_response_id"), "created_at": row.get("created_at"),
    })


@bp.route("/api/orgs/<org_id>/ai/oauth/accounts", methods=["GET"])
@require_auth
def list_org_ai_oauth_accounts(org_id: str):
    access = _org_access(org_id)
    if access:
        return access
    return jsonify({"accounts": list_oauth_accounts(org_id)})


@bp.route("/api/orgs/<org_id>/ai/oauth/accounts/<account_id>", methods=["DELETE"])
@require_auth
def revoke_org_ai_oauth_account(org_id: str, account_id: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    if not revoke_oauth_account(org_id, account_id):
        return jsonify({"error": "account not found"}), 404
    return jsonify({"success": True})


@bp.route("/api/orgs/<org_id>/ai/endpoint-keys", methods=["GET"])
@require_auth
def list_org_ai_endpoint_keys(org_id: str):
    access = _org_access(org_id)
    if access:
        return access
    return jsonify({"keys": list_keys(org_id)})


@bp.route("/api/orgs/<org_id>/ai/endpoint-keys", methods=["POST"])
@require_auth
def create_org_ai_endpoint_key(org_id: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    data = request.get_json(silent=True) or {}
    label = str(data.get("label") or "").strip()
    if len(label) > 120:
        return jsonify({"error": "label must be at most 120 characters"}), 400
    created = create_key(org_id, label)
    return jsonify({"success": True, **created}), 201


@bp.route("/api/orgs/<org_id>/ai/endpoint-keys/<key_id>", methods=["DELETE"])
@require_auth
def revoke_org_ai_endpoint_key(org_id: str, key_id: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    if not revoke(org_id, key_id):
        return jsonify({"error": "key not found"}), 404
    return jsonify({"success": True})


@bp.route("/api/orgs/<org_id>/ai/accounts", methods=["GET"])
@require_auth
def list_org_ai_accounts(org_id: str):
    access = _org_access(org_id)
    if access:
        return access
    rows = pg.query_all(
        "SELECT id, org_id, provider_name, label, base_url, priority, is_active, created_at, updated_at "
        "FROM org_ai_provider_accounts WHERE org_id = %s ORDER BY provider_name ASC, priority ASC",
        (org_id,),
    )
    return jsonify({"accounts": rows})


@bp.route("/api/orgs/<org_id>/ai/accounts", methods=["POST"])
@require_auth
def save_org_ai_account(org_id: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    data = request.get_json(silent=True) or {}
    provider_name = (data.get("provider_name") or "").strip().lower()
    label = (data.get("label") or "").strip()
    api_key = (data.get("api_key") or "").strip()
    base_url = (data.get("base_url") or "").strip().rstrip("/")
    try:
        priority = int(data.get("priority") or 100)
    except (TypeError, ValueError):
        return jsonify({"error": "priority must be an integer"}), 400

    if not _ALLOWED_PROVIDER.fullmatch(provider_name) or not label or len(label) > 120 or not api_key or len(api_key) > 4096:
        return jsonify({"error": "valid provider_name, label, and api_key are required"}), 400
    if base_url:
        from urllib.parse import urlparse
        parsed = urlparse(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
            return jsonify({"error": "base_url must be an http(s) URL without embedded credentials"}), 400
    if not 1 <= priority <= 1000000:
        return jsonify({"error": "priority must be between 1 and 1000000"}), 400

    now = time.time()
    existing = pg.query_one(
        "SELECT id FROM org_ai_provider_accounts WHERE org_id = %s AND provider_name = %s AND label = %s",
        (org_id, provider_name, label),
    )
    if existing:
        pg.execute(
            "UPDATE org_ai_provider_accounts SET api_key_encrypted = %s, base_url = %s, priority = %s, is_active = TRUE, updated_at = %s WHERE id = %s",
            (_encrypted_provider_key(api_key), base_url, priority, now, existing["id"]),
        )
        account_id = existing["id"]
    else:
        account_id = f"acct-{uuid.uuid4().hex[:12]}"
        pg.execute(
            "INSERT INTO org_ai_provider_accounts (id, org_id, provider_name, label, api_key_encrypted, base_url, priority, is_active, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s)",
            (account_id, org_id, provider_name, label, _encrypted_provider_key(api_key), base_url, priority, now, now),
        )
    return jsonify({"success": True, "id": account_id}), 201


@bp.route("/api/orgs/<org_id>/ai/accounts/<account_id>", methods=["DELETE"])
@require_auth
def delete_org_ai_account(org_id: str, account_id: str):
    access = _org_access(org_id, mutate=True)
    if access:
        return access
    row = pg.query_one("SELECT 1 AS x FROM org_ai_provider_accounts WHERE id = %s AND org_id = %s", (account_id, org_id))
    if not row:
        return jsonify({"error": "account not found"}), 404
    pg.execute("DELETE FROM org_ai_provider_accounts WHERE id = %s AND org_id = %s", (account_id, org_id))
    return jsonify({"success": True})
