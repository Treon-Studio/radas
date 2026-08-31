# RADAS 9Router module parity

This document tracks the deliberate implementation boundary between the
RADAS-native 9Router module and upstream 9Router.

Upstream reference: https://github.com/decolua/9router
Audited revision: `90b52e06ffd666b7929554211474d01588f6b1f8` (master, 2026-08-29)
License: MIT (retain upstream attribution when source is copied).

## Capability inventory

| Capability | Upstream evidence | RADAS status |
|---|---|---|
| OpenAI-compatible models/chat | `src/app/api/v1`, `open-sse` | Partial: RADAS `/api/v1/*`; generic upstream adapter exists |
| SSE streaming | `src/sse`, `open-sse` | Partial: pass-through; stream usage/fallback hardening remains |
| Embeddings | `src/app/api/v1/embeddings` | Missing |
| Audio STT/TTS/voices | `src/app/api/v1/audio` | Partial: `POST /api/v1/audio/transcriptions` (multipart STT) + `POST /api/v1/audio/speech` (raw audio TTS) + `GET /api/v1/audio/voices` (OpenAI-style voice catalog per provider, model:voice ids ready for /speech) (OpenAI, Groq multipart; native Gemini STT/TTS via :generateContent with inline_data AUDIO modalities) with endpoint-key auth, rate limits, telemetry |
| Responses/compact | `src/app/api/v1/responses` | Partial: `POST /api/v1/responses` stateless passthrough with usage telemetry, `stream: true` SSE passthrough, and `POST /api/v1/responses/compact` (Responses body routed through the full chat pipeline with `_compact` flag, Responses-shaped output — upstream semantics); stateful conversation storage via `store: true` / `previous_response_id` / `GET /api/v1/responses/{id}` (org-scoped PostgreSQL, context replay on stateless upstreams) |
| Images/video | `src/app/api/v1/images`, video APIs | Partial: `POST /api/v1/images/generations` and the async video job family (`POST /api/v1/videos/{generations,edits,extensions}` create + `GET /api/v1/videos/{id}` poll, provider-prefix stripping, telemetry) with capability-gated passthrough; only xai declares a video config upstream |
| Provider format translation | `open-sse/providers`, translator routes | Partial: OpenAI ↔ Anthropic Messages ↔ Gemini generateContent for text chat (request, response, SSE re-framing; tested against wire details from upstream `open-sse/translator`); tool calls, vision, audio, and remaining protocols untranslated |
| Provider registry | `open-sse/providers/registry` (123 files) | Partial: heuristic provider mapping |
| OAuth providers | `src/lib/oauth/providers` (24 files) | Partial: one framework, three flow families, all 24 upstream providers covered. Authorization-code + PKCE (S256) for the 7 providers with complete registry URLs (`claude`, `codex`, `github`, `gemini-cli`, `antigravity`, `clinepass`, `iflow`); RFC 8628 device-code flows (server-side device_code, `authorization_pending` polling) for `kimi`, `grok-cli`, and `github`; encrypted token import (the server-side equivalent of upstream's operator-machine `import_token`/`browser_token`/custom exchanges) for `cursor`, `kimchi`, `kiro`, `trae`, `codebuddy-cn/intl`, `cline`. Tokens encrypted in PostgreSQL, auto-refresh for refresh-capable flows, credential integration |
| Multiple accounts/rotation | account fallback and provider nodes | Partial: per-provider API-key accounts with priority + sticky round-robin (schema V26); OAuth accounts still missing |
| Combos and ordered fallback | combo APIs and fallback executor | Partial: one PostgreSQL route chain |
| Quotas/reset estimates | quota APIs and usage models | Partial: per-model cost estimates from public rates (estimates only, never billing), cost/token/latency aggregation over date ranges (`/ai/costs`), in-process per-provider rate limits; quota reset times and durable quotas missing |
| Request/debug logs | usage/log APIs | Partial: redacted per-request attempt logs (org-scoped PostgreSQL `org_ai_request_logs`, date-range/status filters via `/ai/logs`, request-ID correlation headers); prompt/response bodies are never persisted |
| Caveman/Ponytail/Headroom/Pxpipe | `open-sse/rtk`, `pxpipe`, headroom APIs | Partial: Caveman off/lite/full/ultra prompt modifier; Ponytail persona injection (lite/full/ultra) via `X-9Router-Ponytail`; `POST /api/v1/compress` with optional Headroom forwarding (fail-open) or local RTK fallback; Pxpipe via `PXPIPE_URL` render service (Claude-format, min-chars gate, fail-open) through `/v1/compress` |
| API key/JWT gateway auth | `api/auth`, endpoint settings | Partial: RADAS JWT/API-token auth plus org-scoped gateway endpoint keys (`radas_epk_*`, SHA-256 hashed); upstream REQUIRE_API_KEY config mode not mirrored |
| Dashboard/provider management | `src/app/dashboard`, provider pages | Partial: RADAS `/system/ai` |
| RTK filters | `open-sse/rtk` | Partial: RADAS-native port of the upstream filter families with the same auto-detect order (git-log, git-diff per-hunk caps, git-status summary incl. porcelain, build-output run collapse, grep per-file caps, find dir grouping, tree/ls caps, read-numbered, dedup-log, smart-truncate); Headroom/Ponytail/Pxpipe and `/v1/compress` still missing |
| Proxy pools/tunnel/Tailscale | `proxy-pools`, `tunnel` APIs | Partial: org-scoped egress proxy pools (http/https URLs encrypted at rest, sticky round-robin rotation across active pools, CRUD + `/test` egress health check, proxy-bound gateway instances used by every upstream call). Tunnel/Tailscale and the MITM traffic-capture layer are not ported: they capture local CLI traffic on the operator machine, a deployment model the server-side RADAS gateway replaces |
| CLI tool integrations | `cli/`, CLI-tools pages | Missing for RADAS CLI/desktop |
| SQLite persistence | `src/lib/db` | Intentionally not copied; RADAS PostgreSQL is source of truth |

A status of “Partial” is not treated as completion. Each missing capability
must be assigned an implementation issue and an integration test before the
module can claim parity.
