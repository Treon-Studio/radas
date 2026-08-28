# Console–CLI Integration Deep Audit

**Date:** 2026-08-27  
**Repository:** RADAS  
**Actual applications in this checkout:** `apps/server`, `apps/console`, `apps/cli`, `apps/worker`

## Executive Summary

The console and CLI can independently connect to the same Flask server over HTTP, but they are not yet a reliable shared product surface. The current relationship is:

```text
apps/console ─┐
              ├── HTTP / API contract ──> apps/server ──> PostgreSQL + apps/worker
apps/cli ─────┘
```

There is no direct console-to-CLI process or IPC bridge, and that is the correct default architecture. The missing work is contract, authentication context, route parity, and failure semantics—not browser-to-process spawning.

**Confidence:** transport compatibility 0.85; authentication interoperability 0.75; functional feature parity 0.35; direct console↔CLI bridge absent 0.95.

## What Works Today

### Console to server

- `apps/console/src/lib/api.ts:117-147` wraps `fetch`, adds Bearer authentication, `X-Project-Id`, credentials, and API base handling.
- `apps/console/src/lib/api.ts:52-95` parses current success/error envelopes and request IDs.
- `apps/console/src/lib/auth.ts:25-40` calls `POST /api/auth/login` and persists access/refresh tokens.
- `apps/console/src/lib/project.ts:52-90` loads projects, switches active project, and invalidates project-scoped queries.
- `apps/console/vite.config.ts:15-24` proxies `/api` to `http://localhost:5001` by default.
- `apps/server/app.py:94-147` configures CORS for the console origin and allows `Authorization`, `X-Project-Id`, `X-Request-Id`, `X-Trace-Id`, and `Idempotency-Key`.

### CLI to server

- `apps/cli/internal/client/client.go:16-43` defines a reusable HTTP client with base URL, token, and timeout.
- `apps/cli/internal/client/client.go:46-75,136-146` performs requests and sends Bearer authentication/User-Agent.
- Commands consistently read `RADAS_API_URL` and `RADAS_TOKEN`, defaulting to `http://localhost:5001`; examples include `cmd/stack/stack.go:48-61`, `cmd/flags/flags.go:36-45`, and `cmd/approval/approval.go:35-44`.
- Server middleware accepts Bearer JWT/API-token authentication (`apps/server/auth/middleware.py:117-222`).

Therefore, setting `RADAS_API_URL` to the same server used by the console and supplying a valid RADAS token is sufficient for basic HTTP connectivity.

## Critical Gaps

### 1. CLI does not send project or request context

The Go client adds only `Authorization` and `User-Agent` (`apps/cli/internal/client/client.go:136-146`). It does not add:

```http
X-Project-Id: <project>
X-Org-Id: <organization>
X-Request-Id: <request>
X-Trace-Id: <trace>
Idempotency-Key: <mutation-key>
```

The server resolves project scope from headers, query, body, or path (`apps/server/auth/middleware.py:310-389`). The console already sends `X-Project-Id`, so the same operation can behave differently in the CLI.

**Impact:** wrong/default project selection, failed project-scoped calls, missing audit correlation, and duplicate executions on retry.

**Required fix:** extend `client.Config` and request options with project/org/request/idempotency context; make mutating commands derive stable idempotency keys.

### 2. CLI has no login or refresh flow

The console obtains and refreshes browser tokens via `apps/console/src/lib/auth.ts`. The CLI only reads `RADAS_TOKEN`; no CLI token acquisition/refresh command was found.

**Impact:** users must manually copy a browser/API token; expired JWTs fail without recovery.

**Required fix:** add `radas auth login`, secure token storage (OS keychain where available, restrictive file fallback), refresh support, logout/revoke, and `--api-url`/`--project-id`/`--org-id` overrides.

### 3. Several CLI routes do not match server routes

| CLI request | Evidence | Server contract | Evidence |
|---|---|---|---|
| `POST /api/users/invite` | `apps/cli/cmd/user/user.go:96` | `POST /api/users/invites` | `apps/server/api/user_invite_routes.py:21` |
| `GET /api/registry/items` | `apps/cli/cmd/registry/registry.go:60` | `GET /api/registry` | `apps/server/api/code_registry_routes.py:21` |
| `POST /api/registry/install` | `apps/cli/cmd/registry/registry.go:91` | `POST /api/registry/<name>/install` | `apps/server/api/code_registry_routes.py:47` |
| `GET /api/approvals/pending` | `apps/cli/cmd/approval/approval.go:61` | `GET /api/approvals` | `apps/server/api/approval_routes.py:26` |
| `GET /api/audit` | `apps/cli/cmd/audit/audit.go:63` | `GET /api/audit-log` | `apps/server/api/audit_log_routes.py:60` |

Other unverified/mismatched CLI paths include `/api/orgs/<id>/rules`, flag toggle/kill-switch subpaths, worker list/drain, policy exemptions, FinOps estimate, and cloud stack plan/apply paths.

### 4. CLI masks server failures with fake/local success

High-risk examples:

- `apps/cli/cmd/stack/stack.go:80-95` falls back to local/static rows when stack listing fails.
- `apps/cli/cmd/stack/stack.go:112-117` reports local plan completion on request failure.
- `apps/cli/cmd/stack/stack.go:138-145` reports apply completion on request failure.
- `apps/cli/cmd/cloud/cloud.go:44-115` probe/inventory flows do not use the server client and print static/local results.
- `apps/cli/cmd/org/org.go:62-78` and `apps/cli/cmd/flags/flags.go:64-78` discard errors and show fallback output.

**Impact:** a user can believe infrastructure changed when the server was never reached or returned an error.

**Required fix:** remove fallback success; return typed errors and non-zero exit codes. Any intentionally offline behavior must be explicitly labeled `--offline` and must never claim remote mutation succeeded.

### 5. No direct console↔CLI bridge exists

- `apps/desktop-app/main.js:112` loads the console URL.
- `apps/console/src/lib/desktopBridge.ts:1-38` exposes window controls only.
- No CLI execution, socket, postMessage, or IPC bridge was found.

This is not itself a defect. Do not add arbitrary browser process spawning. If desktop orchestration is required later, use an explicit authenticated loopback daemon/IPC protocol with allowlisted commands.

### 6. Shared OpenAPI/generated client is not in use

- Server legacy spec: `apps/server/openapi/spec.py:50-60`, served via `/api/openapi.json` from `apps/server/api/api_tokens_docs_routes.py:174-186`.
- Server v2 docs: `apps/server/api_v2/__init__.py:49-109`, served via `/api/v2/openapi.json` and `/api/v2/docs`.
- CLI OpenAPI tooling (`apps/cli/internal/frontend/parser/openapi.go` and generator templates) is not connected to the live RADAS server contract.
- No checked-in generated Go or TypeScript RADAS client was found.
- `@radas/api-client` does not exist; `@radas/types` is empty and existing validation/Axios utilities are not canonical.
- `apps/cli/radas.yml:12-18` points at a nonexistent `contracts/investrack/api/openapi.json` path.

**Required fix:** make an explicit, versioned `/api/v2` surface the canonical shared contract, export/snapshot its OpenAPI document, add explicit schemas for high-value domains, then generate or maintain typed adapters for Go and TypeScript.

### 7. API response contracts are split

- New server envelope: `apps/server/api/platform_contracts.py:158-197` (`data`/`error` plus `request_id`).
- Console understands the envelope: `apps/console/src/lib/api.ts:52-95`.
- CLI has separate status/error decoding: `apps/cli/internal/client/client.go:169-193`.
- Many legacy `/api/*` routes still retain older response shapes.

**Required fix:** do not rewrite all legacy routes at once. Define `/api/v2` operation IDs and schemas, and provide a typed compatibility decoder for remaining legacy endpoints.

### 8. Console coverage is incomplete and has no test script

`apps/console/package.json:5-10` has typecheck/build scripts but no test script. Backend capabilities not found as clear console API usage include:

- bastion CRUD;
- retry policy/sweep;
- automation rules and maintenance;
- MFA management;
- provider mirror;
- inbound webhook management;
- branch mapping;
- audit export/prune;
- some environment controls.

Some apparent route gaps are false positives because the console rewrites `/_current/` paths and blueprints add prefixes; each path must be validated against `app.url_map` before changing it.

## Recommended Implementation Phases

### Phase A — Transport context and truthful CLI behavior

1. Extend `apps/cli/internal/client/client.go` with project/org/request/trace/idempotency headers.
2. Centralize command client construction; remove duplicated `RADAS_API_URL`/`RADAS_TOKEN` setup.
3. Add typed success/error/operation envelopes and retryability metadata.
4. Replace fallback/fake success in stack, cloud, org, flags, registry, and worker commands with explicit errors.
5. Add `httptest.Server` tests asserting headers, status handling, and non-zero command behavior.

**Gate:** Go client tests plus route-aware command tests pass; failed server calls can never print successful remote mutation.

### Phase B — Shared contract surface

1. Treat `/api/v2` as the new shared surface; keep `/api/*` legacy stable.
2. Add explicit schemas and stable operation IDs for auth, org/project, stack, flags, approvals, workers, services, and search.
3. Make `/api/v2/openapi.json` mandatory in the server readiness/CI contract job rather than silently optional.
4. Snapshot the spec under a contracts directory only after comparing it with the served output.
5. Add spec diff and duplicate-operation-ID checks.

**Gate:** served OpenAPI snapshot is reproducible and route/schema tests pass.

### Phase C — CLI authentication and project selection

1. Add CLI login, refresh, logout, and token status commands.
2. Add global flags: `--api-url`, `--token`, `--project-id`, `--org-id`, `--request-id`.
3. Persist tokens securely and never print them.
4. Add `project list` and `project use` that actually call server endpoints.
5. Add an integration test: login → choose project → authenticated project-scoped request.

**Gate:** CLI can operate without copying browser localStorage values and always sends project context when required.

### Phase D — Route parity migration

Migrate one domain at a time with server contract tests and CLI `httptest` tests:

1. users invites;
2. registry;
3. approvals;
4. audit;
5. flags;
6. worker operations;
7. cloud stack actions;
8. policy/FinOps.

**Gate:** every CLI remote path maps to a registered server route and has an error-path test.

### Phase E — Console wiring and test harness

1. Add Vitest + React Testing Library/jsdom to `apps/console`.
2. Test API envelope parsing, auth redirect, project switching, onboarding, and mutation idempotency.
3. Add UI flows for backend capabilities listed above or document each as intentionally API-only.
4. Add global search and project dashboard route smoke tests.

**Gate:** `pnpm typecheck`, `pnpm test -- --run`, and `pnpm build` all pass.

### Phase F — Cross-client CI and optional desktop integration

1. Start Flask with PostgreSQL test data in CI.
2. Fetch and validate `/api/v2/openapi.json`.
3. Run one equivalent read and mutation through Go and TypeScript clients.
4. Assert identical project scope, status code, idempotency, request ID, and error code.
5. Keep desktop↔CLI IPC out of scope unless a separately authenticated loopback daemon is specified.

**Gate:** console/CLI/server contract parity job passes without a real cloud provider or Docker daemon.

## Verification Commands

```bash
cd apps/server
.venv/bin/python -m compileall -q api api_v2 services storage app.py
.venv/bin/pytest -q

cd ../cli
go test ./...

cd ../console
pnpm typecheck
pnpm build
# After Phase E:
pnpm test -- --run

cd ../..
git diff --check
```

Live route inventory:

```bash
cd apps/server
.venv/bin/python -c 'from app import app; print(sorted((r.rule, sorted(r.methods-{"HEAD","OPTIONS"})) for r in app.url_map.iter_rules() if r.rule.startswith("/api/")))'
```

## Bottom Line

RADAS is connected at the transport level but not yet integrated at the product-contract level. The highest-value first implementation is **Phase A**, not a direct console-to-CLI bridge:

1. send project/idempotency context from CLI;
2. stop masking remote failures;
3. fix route mismatches;
4. establish `/api/v2` as a versioned shared contract;
5. add cross-client CI before claiming parity.
