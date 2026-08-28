# RADAS Console–CLI Full Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Every task uses checkbox (`- [ ]`) tracking, writes a failing test before implementation, runs its focused gate, and ends with a focused commit.

**Goal:** Make `apps/console` and `apps/cli` reliable, tenant-aware, contract-compatible clients of `apps/server`, with verified end-to-end parity and no false-success behavior.

**Architecture:** The Flask server remains the sole source of truth and execution control plane. Console and CLI remain separate clients—there is intentionally no browser-to-process bridge—with shared behavior defined by a versioned `/api/v2` OpenAPI contract, common envelope/error semantics, and equivalent project-scoped HTTP requests. The Go client owns CLI auth/config/retry/rendering; the TypeScript client owns browser token storage/navigation/cache; neither client shares UI code or runtime credentials directly.

**Tech Stack:** Python 3.14, Flask, PostgreSQL/psycopg, pytest, Flask-Smorest/OpenAPI, Go 1.25, `net/http`, `httptest`, React 19, TanStack Router/Query, TypeScript, Vite, Vitest, React Testing Library, GitHub Actions, Docker/Podman (optional local runtime).

## Global Constraints

- Use actual application paths in this checkout: `apps/server`, `apps/console`, `apps/cli`, and `apps/worker`.
- Do not add a direct console-to-CLI process spawn, arbitrary IPC, or browser shell execution. Both clients communicate with `apps/server` over HTTP.
- Preserve existing legacy `/api/*` behavior while introducing or strengthening `/api/v2/*`; do not mass-rewrite legacy response shapes.
- PostgreSQL is mandatory for server runtime; schema changes go through `apps/server/storage/pg_schema.py` and its canonical migration runner.
- Project-scoped requests must carry tenant context and enforce server-side membership; never trust a client-selected project without authorization.
- Mutating requests must carry idempotency and request correlation where the server supports them.
- Never expose access tokens, refresh tokens, provider credentials, secret values, private keys, command-line secrets, or encrypted secret payloads in logs, errors, search results, or snapshots.
- A remote failure must never be rendered as successful remote mutation. Offline behavior must be explicit and clearly labeled.
- Do not modify pre-existing dirty console assets/routes or `pnpm-workspace.yaml` without first recording ownership and obtaining a clean diff boundary.
- Do not mark roadmap items ✅ based solely on a file, route, or unit test; require registered route plus an executable flow test.
- Follow the repository’s Node/pnpm and Go version constraints from executable CI/config; reconcile docs separately.
- After code changes, run `graphify update .`; graph freshness is verified against `git rev-parse HEAD`.

## Baseline Findings

The deep audit is recorded in `docs/architecture/console-cli-integration-audit-2026-08-27.md`. The implementation plan is based on these concrete facts:

- Console HTTP wrapper: `apps/console/src/lib/api.ts:117-147` sends Bearer and `X-Project-Id`; `apps/console/vite.config.ts:15-24` proxies to `http://localhost:5001`.
- CLI HTTP client: `apps/cli/internal/client/client.go:16-43,46-75,136-146` sends Bearer/User-Agent but no project, organization, request, trace, or idempotency headers.
- CLI command factories duplicate `RADAS_API_URL`/`RADAS_TOKEN` setup across `apps/cli/cmd/*`.
- CLI route mismatches include users invite, registry, approvals, audit, flags, workers, policy/FinOps, and cloud stack operations.
- `apps/cli/cmd/stack/stack.go:80-95,112-117,138-145` and `apps/cli/cmd/cloud/cloud.go:44-115` contain fallback/static/fake-success behavior.
- Server contracts are split between legacy `/api/openapi.json`, optional `/api/v2/openapi.json`, and platform envelopes in `apps/server/api/platform_contracts.py:158-197`.
- No generated client is consumed by either client; `@radas/api-client` does not exist and `apps/cli/radas.yml:12-18` points to a nonexistent contract path.
- `apps/console/package.json:5-10` has no test script.
- Blueprint registration is fail-open in `apps/server/app.py:67-80` and `apps/server/api/__init__.py:125-133`.
- Important storage/notification errors are swallowed in `apps/server/auth/service.py:167-174` and `apps/server/services/budget_service.py:18-25,56-69,80-90`.
- `graphify-out/GRAPH_REPORT.md:13` was generated from an older commit and is not authoritative until refreshed.

---

# Phase 0 — Baseline, Contract Freeze, and Safety Boundaries

**Outcome:** The team has an executable route inventory, contract policy, clean ownership boundary, and reproducible baseline before client migration.

### Task 0.1 — Capture repository ownership and baseline

**Files:**
- Create: `docs/verification/2026-08-27-console-cli-baseline.md`
- Test/script: `scripts/verify-repo-layout.sh`

**Interfaces:**
- Produces: a recorded baseline of `git status`, actual app paths, tool versions, current route count, and known dirty files.

- [ ] Write `scripts/verify-repo-layout.sh` to assert `apps/server`, `apps/console`, `apps/cli`, and `apps/worker` exist, and fail if active scripts reference nonexistent `apps/opensible-server` or `apps/radas-console` paths.
- [ ] Run it before touching unrelated dirty files.
- [ ] Record exact commands and outputs in the verification document.
- [ ] Commit only the new verification artifact and script.

```bash
./scripts/verify-repo-layout.sh

git diff --check
```

Expected: layout checks pass; pre-existing dirty assets are listed but not staged.

### Task 0.2 — Runtime route inventory and required/optional blueprint policy

**Files:**
- Modify: `apps/server/api/__init__.py:19-133`
- Modify: `apps/server/app.py:67-92`
- Create: `apps/server/api/route_inventory.py`
- Create: `apps/server/tests/test_route_inventory.py`
- Create: `docs/architecture/api-contract-inventory.md`

**Interfaces:**
- `collect_routes(app) -> list[dict[str, Any]]`
- `register_blueprints(app, *, strict_required: bool = True) -> None`
- Readiness reports `required_blueprints_ok`, `database_ok`, and `contract_version`.

- [ ] Write a failing test that creates an app with one intentionally broken required blueprint and asserts readiness is not healthy.
- [ ] Define an explicit required module set covering auth, projects, executions, worker, platform contracts, services, and readiness; classify integrations as optional.
- [ ] Replace broad fail-open behavior for required modules with a startup exception or readiness failure; retain logged skip only for optional modules.
- [ ] Add route inventory output with path, methods, endpoint, blueprint, auth/scope class, and contract namespace.
- [ ] Add a test that detects duplicate `(method, path)` ownership and unregistered expected routes.
- [ ] Run focused tests and commit.

```bash
cd apps/server
.venv/bin/pytest -q tests/test_route_inventory.py tests/test_platform_contracts.py
```

### Task 0.3 — Canonical migration/reproducibility gate

**Files:**
- Modify: `apps/server/storage/pg_schema.py`
- Review: `apps/server/storage/migrations/*.sql`
- Create: `apps/server/tests/test_schema_reproducibility.py`

**Interfaces:**
- `schema_snapshot(conn) -> dict[str, list[str]]`
- `migrate()` remains the only production schema entrypoint.

- [ ] Write a test that runs migration twice and compares tables, columns, indexes, and migration versions.
- [ ] Resolve duplicated definitions for onboarding, project locks, remote-state locks, service tables, and observability tables.
- [ ] Ensure fresh and upgrade paths produce equivalent schema.
- [ ] Fail if a numbered SQL file is not reachable from the canonical migration runner.
- [ ] Commit migration/test changes independently.

```bash
cd apps/server
.venv/bin/pytest -q tests/test_schema_reproducibility.py
```

### Task 0.4 — Refresh graph and freeze contract document

**Files:**
- Modify: `docs/architecture/all-in-one-platform.md`
- Modify: `docs/ROADMAP.md` only for evidence links, not optimistic status changes
- Refresh: `graphify-out/`

- [ ] Re-run `graphify update .`.
- [ ] Verify graph header source commit equals `git rev-parse HEAD`.
- [ ] Add a section to the contract map stating that `/api/v2` is the forward contract and `/api/*` remains compatibility surface.
- [ ] Commit graph and docs separately from application code.

---

# Phase 1 — Shared Transport Context and Truthful CLI Behavior

**Outcome:** CLI requests carry the same tenant/request semantics as console requests, and failures are impossible to misread as successful remote operations.

### Task 1.1 — Extend the Go client request context

**Files:**
- Modify: `apps/cli/internal/client/client.go:16-200`
- Modify: `apps/cli/internal/client/client_test.go`
- Create: `apps/cli/internal/client/context.go`

**Interfaces:**

```go
type Config struct {
    BaseURL        string
    AuthToken      string
    ProjectID      string
    OrganizationID string
    RequestID      string
    TraceID        string
    Timeout        time.Duration
}

type RequestOptions struct {
    IdempotencyKey string
    ProjectID      string
    OrganizationID string
    RequestID      string
    TraceID        string
}

func (c *Client) Do(ctx context.Context, method, path string, body any, opts RequestOptions) (*Response, error)
```

- [ ] Write failing `httptest.Server` tests asserting Bearer, `X-Project-Id`, `X-Org-Id`, `X-Request-Id`, `X-Trace-Id`, and `Idempotency-Key` headers.
- [ ] Implement one request builder used by GET/POST/PUT/DELETE/SSE paths.
- [ ] Generate request IDs when absent; never log token values.
- [ ] Preserve current relative URL joining and typed HTTP error capture.
- [ ] Add tests for malformed URL, timeout, non-JSON error, and empty body.
- [ ] Commit only client/context changes.

```bash
cd apps/cli
go test ./internal/client -run 'Test(Client|RequestContext)' -v
```

### Task 1.2 — Centralize CLI configuration and project selection

**Files:**
- Modify: `apps/cli/cmd/rootcmd/*.go`
- Modify: `apps/cli/cmd/flags/flags.go`, `org.go`, `user.go`, `registry.go`, `stack.go`, `worker.go`, `approval.go`, `policy.go`, `audit.go`, `cost.go`, `cloud.go`
- Create: `apps/cli/internal/config/runtime.go`
- Create: `apps/cli/internal/config/runtime_test.go`

**Interfaces:**

```go
type RuntimeConfig struct {
    APIURL string
    Token string
    OrganizationID string
    ProjectID string
}
func LoadRuntimeConfig(cmd *cobra.Command) (RuntimeConfig, error)
```

- [ ] Write tests showing command factories no longer independently default environment values.
- [ ] Add persistent flags `--api-url`, `--token`, `--org-id`, `--project-id` with environment fallback.
- [ ] Store active project in CLI config only as a selector; server remains authorization authority.
- [ ] Replace duplicated client constructors with one `LoadRuntimeConfig` path.
- [ ] Add project list/use commands that call server routes and persist only IDs.
- [ ] Commit after Go tests pass.

### Task 1.3 — Remove false-success and implicit offline behavior

**Files:**
- Modify: `apps/cli/cmd/stack/stack.go`
- Modify: `apps/cli/cmd/cloud/cloud.go`
- Modify: `apps/cli/cmd/org/org.go`
- Modify: `apps/cli/cmd/flags/flags.go`
- Modify: `apps/cli/cmd/registry/registry.go`
- Modify: `apps/cli/cmd/worker/worker.go`
- Create/extend: command tests using `httptest.Server`

**Interfaces:**
- Remote mutation returns non-nil error and non-zero command status when server fails.
- `--offline` is explicit and output is labeled `offline`; it cannot be used for remote mutation commands.

- [ ] Write failing tests where server returns 401/404/500 and assert no success text is printed.
- [ ] Remove static fallback rows from remote list commands; return typed error with request ID.
- [ ] Remove local “plan/apply complete” messages when HTTP calls fail.
- [ ] Mark cloud probe/inventory local-only paths explicitly or wire them to real server endpoints; do not silently claim remote state.
- [ ] Add tests for offline mode and ensure it cannot call mutating endpoints.
- [ ] Commit the behavior change.

```bash
cd apps/cli
go test ./cmd/... ./internal/client/... -v
```

---

# Phase 2 — Canonical OpenAPI Contract and Server Route Parity

**Outcome:** Console and CLI have a stable, versioned contract surface with explicit schemas for shared domains.

### Task 2.1 — Make `/api/v2` required and reproducible

**Files:**
- Modify: `apps/server/api_v2/__init__.py:49-109`
- Modify: `apps/server/requirements.txt` or dependency manifest
- Modify: `apps/server/app.py:82-92`
- Create: `apps/server/scripts/export_openapi.py`
- Create: `apps/server/tests/test_openapi_contract.py`
- Create: `contracts/radas-api-v2.openapi.json`

**Interfaces:**
- `GET /api/v2/openapi.json` returns OpenAPI 3.1 with stable `info.version` and operation IDs.
- `python apps/server/scripts/export_openapi.py --output contracts/radas-api-v2.openapi.json` produces byte-stable output.

- [ ] Write a failing test asserting v2 is available in the test environment and has required tags/schemas.
- [ ] Make Flask-Smorest a required server dependency for the contract surface; if unavailable, readiness/CI fails rather than silently disabling v2.
- [ ] Export the served document and compare it with the committed snapshot.
- [ ] Add checks for duplicate operation IDs, undocumented required parameters, and missing error responses.
- [ ] Keep legacy `/api/openapi.json` unchanged until a separately reviewed migration.
- [ ] Commit snapshot and exporter.

### Task 2.2 — Define shared envelopes and schemas

**Files:**
- Modify: `apps/server/api_v2/_common.py`
- Modify: `apps/server/api/platform_contracts.py`
- Create: `apps/server/api_v2/schemas/contracts.py`
- Modify: `contracts/radas-api-v2.openapi.json`
- Create: `apps/server/tests/test_shared_envelopes.py`

**Interfaces:**

```json
{"data": {}, "request_id": "uuid"}
{"error": {"code": "string", "message": "string", "details": {}}, "request_id": "uuid"}
{"operation": {"id": "string", "status": "queued"}, "request_id": "uuid"}
```

- [ ] Write tests for success, structured error, async operation, pagination, and validation error.
- [ ] Define stable schemas and operation IDs without changing legacy payloads.
- [ ] Ensure redaction policy is represented in schema descriptions and tests.
- [ ] Ensure API errors expose retryability only as a boolean/category, never internal exception text or credentials.
- [ ] Commit contract definitions.

### Task 2.3 — Explicit schemas for high-value shared domains

**Files:**
- Modify/create under `apps/server/api_v2/`: auth, org/project, cloud stack, flags, approvals, workers, services, search routes/schemas.
- Create: `apps/server/tests/test_v2_shared_domains.py`

- [ ] Add explicit request/response schemas for auth/token, org/project, flags, approvals, workers, services, and `/api/search`.
- [ ] Add project/org security requirements and idempotency header parameters to mutations.
- [ ] Replace generic auto-proxy schema for these domains only.
- [ ] Add route-level tests that load the Flask app and validate representative responses against the v2 spec.
- [ ] Commit per domain or in one reviewable contract batch.

### Task 2.4 — Build route parity checker

**Files:**
- Create: `apps/server/scripts/check_route_parity.py`
- Create: `apps/server/tests/test_route_parity.py`
- Create: `contracts/cli-route-manifest.json`

**Interfaces:**

```text
check_route_parity.py --client-manifest contracts/cli-route-manifest.json
```

- [ ] Generate the server route set from `app.url_map`.
- [ ] Parse CLI path constants/request calls into a reviewed manifest.
- [ ] Fail on missing server route, method mismatch, or unclassified local-only command.
- [ ] Account for blueprint prefixes and console `/_current/` rewriting explicitly.
- [ ] Commit the checker and initial manifest with known mismatches marked as failures, not waived silently.

---

# Phase 3 — CLI Authentication, Domain Adapters, and Endpoint Parity

**Outcome:** CLI can authenticate independently, select a project, and use real server routes through typed adapters.

### Task 3.1 — CLI auth lifecycle

**Files:**
- Create: `apps/cli/cmd/auth/auth.go`
- Create: `apps/cli/internal/auth/store.go`
- Create: `apps/cli/internal/auth/store_test.go`
- Modify: `apps/cli/main.go`
- Modify: `apps/server/api/auth_routes.py` only if refresh contract is incomplete
- Create: `apps/server/tests/test_cli_auth_contract.py`

**Interfaces:**

```text
radas auth login [--api-url URL]
radas auth refresh
radas auth status
radas auth logout
```

- [ ] Write tests for login success, invalid credentials, refresh expiry, logout/revoke, and token-file permission failure.
- [ ] Prefer OS keychain; use a restrictive local file fallback with `0600` permissions and no token printing.
- [ ] Store API URL, access/refresh token metadata, and active org/project IDs separately from command output.
- [ ] Implement refresh before a request when access token is expired; clear credentials on invalid refresh.
- [ ] Add non-interactive support via `RADAS_TOKEN` for CI without weakening secure defaults.
- [ ] Commit auth lifecycle.

### Task 3.2 — Fix users, registry, approvals, and audit adapters

**Files:**
- Modify: `apps/cli/cmd/user/user.go`
- Modify: `apps/cli/cmd/registry/registry.go`
- Modify: `apps/cli/cmd/approval/approval.go`
- Modify: `apps/cli/cmd/audit/audit.go`
- Create/extend: `apps/cli/cmd/*/*_test.go`

- [ ] Write failing `httptest.Server` tests using actual server paths and response envelopes.
- [ ] Change `/api/users/invite` to `/api/users/invites`.
- [ ] Change registry list/install to `/api/registry` and `/api/registry/<name>/install`.
- [ ] Change approval list to `/api/approvals` and map filtering client-side only when contract says so.
- [ ] Change audit to `/api/audit-log` with project context.
- [ ] Assert project and idempotency headers on mutations.
- [ ] Commit this domain batch.

### Task 3.3 — Fix flags, worker, policy, FinOps, and cloud adapters

**Files:**
- Modify: `apps/cli/cmd/flags/flags.go`
- Modify: `apps/cli/cmd/worker/worker.go`
- Modify: `apps/cli/cmd/policy/policy.go`
- Modify: `apps/cli/cmd/cost/cost.go`
- Modify: `apps/cli/cmd/stack/stack.go`
- Modify: `apps/cli/cmd/cloud/cloud.go`
- Create/extend: corresponding Go tests and server route tests

- [ ] Enumerate exact server routes from `app.url_map` before changing each command.
- [ ] Replace flag toggle/kill-switch subpaths with the server’s supported PATCH contract or add explicit compatibility routes only if product-approved.
- [ ] Wire worker list/drain to registered worker routes or classify unsupported commands as errors.
- [ ] Map policy exemptions and FinOps requests to registered endpoints; remove dead calls.
- [ ] Implement cloud stack list/plan/apply against actual server routes; if a route is genuinely missing, implement it server-side with authorization and idempotency rather than retaining fake CLI output.
- [ ] Add success/error tests for each command.
- [ ] Commit only after route parity checker passes for changed domains.

### Task 3.4 — CLI/server integration test

**Files:**
- Create: `apps/server/tests/test_cli_server_integration.py`
- Create: `apps/cli/internal/integration/server_contract_test.go`
- Create: `scripts/run-cli-server-contract-test.sh`

- [ ] Start Flask against PostgreSQL test data.
- [ ] Obtain a token, choose a project, and call one read and one mutation from the Go client.
- [ ] Assert same HTTP status, request ID presence, project scope, idempotency replay behavior, and error code as direct server requests.
- [ ] Make the script deterministic and safe for CI without cloud credentials.
- [ ] Commit integration harness.

---

# Phase 4 — Console Test Harness and Missing UI Wiring

**Outcome:** The actual console has automated route/API tests and exposes the high-value backend capabilities that currently have no UI entry point.

### Task 4.1 — Add console unit/component test harness

**Files:**
- Modify: `apps/console/package.json`
- Create: `apps/console/vitest.config.ts`
- Create: `apps/console/src/test/setup.ts`
- Create: `apps/console/src/lib/api.test.ts`
- Create: `apps/console/src/routes/__root.test.tsx`
- Create: `apps/console/src/routes/projects/project-flow.test.tsx`

- [ ] Add Vitest, jsdom, and React Testing Library compatible with the existing lockfile/toolchain.
- [ ] Add scripts `test` and `test:watch` without changing existing Vite build behavior.
- [ ] Test envelope unwrapping, structured errors, 401 handling, `X-Project-Id`, `Idempotency-Key`, and request cancellation.
- [ ] Test root auth and onboarding redirect decisions.
- [ ] Test project switch invalidation and route rendering.
- [ ] Commit harness before adding feature pages.

```bash
cd apps/console
pnpm typecheck
pnpm test -- --run
pnpm build
```

### Task 4.2 — Wire audit, automation, retry, webhook, and branch mapping pages

**Files:**
- Create/modify routes under `apps/console/src/routes/` for audit, automation, retry policy, inbound webhooks, and branch mapping.
- Modify: `apps/console/src/components/app-shell/NavSections.tsx`
- Modify: `apps/console/src/components/app-shell/Breadcrumbs.tsx`
- Create component tests for each page.

- [ ] Add route-level loading, empty, unauthorized, validation, conflict, and server-error states.
- [ ] Wire CRUD/mutation requests to registered server paths and include idempotency keys.
- [ ] Display branch mapping preview and matched environment without exposing webhook secrets.
- [ ] Implement breadcrumbs from route metadata; replace the unconditional null placeholder.
- [ ] Add tests for permissions and tenant switching.
- [ ] Commit this page batch.

### Task 4.3 — Wire bastion, MFA, provider mirror, and environment controls

**Files:**
- Create/modify: `apps/console/src/routes/system/bastion.tsx`
- Create/modify: `apps/console/src/routes/system/mfa.tsx`
- Create/modify: `apps/console/src/routes/system/provider-mirror.tsx`
- Create/modify: environment-role routes/components
- Modify: navigation and route tree generated through the project’s normal generator

- [ ] Verify backend permissions before rendering actions.
- [ ] Add secure secret/key input components that never put credentials in URL/query/cache keys.
- [ ] Add confirmation dialogs for destructive operations.
- [ ] Test accessible keyboard flow and error recovery.
- [ ] Commit UI batch.

### Task 4.4 — Global search and project dashboard contract tests

**Files:**
- Create/modify: `apps/console/src/components/search/GlobalSearch.tsx`
- Modify: dashboard route and query utilities
- Create: `apps/console/src/components/search/GlobalSearch.test.tsx`
- Create: dashboard widget tests

- [ ] Connect search to the canonical endpoint and render stack/run/secret metadata only.
- [ ] Enforce query minimum, debounce, cancellation, result limit, project scope, and keyboard navigation.
- [ ] Test that secret values never render.
- [ ] Verify dashboard widgets use the active project and handle partial API failure per widget.
- [ ] Commit search/dashboard tests and wiring.

---

# Phase 5 — Server Reliability, Security, and Runtime Lifecycle

**Outcome:** Cross-client integration cannot silently hide auth, billing, lock, provider, or secret failures.

### Task 5.1 — Required blueprint and readiness hardening

**Files:**
- Modify: `apps/server/app.py:67-92`
- Modify: `apps/server/api/__init__.py:19-133`
- Create: `apps/server/tests/test_readiness_failures.py`

- [ ] Test required blueprint import failure and assert `/readyz` is unhealthy/non-200.
- [ ] Test optional integration failure remains visible in readiness diagnostics but does not remove required APIs.
- [ ] Ensure readiness does not expose stack traces, database URLs, or secrets.
- [ ] Add startup log with module name/error code/request-free correlation.
- [ ] Commit hardening.

### Task 5.2 — Runtime provider reachability and local container safety

**Files:**
- Modify: `apps/server/services/runtime_registry.py:424-436`
- Modify: `apps/server/services/service_operation_runner.py`
- Modify: `apps/server/services/service_observability.py`
- Modify: `apps/server/services/runtime_providers/local_container.py`
- Create: `apps/server/tests/test_runtime_provider_reachability.py`

- [ ] Write tests proving operation runner and observability receive the same explicitly configured provider registry.
- [ ] Add explicit config for `enable_local_container`, runtime binary, network, timeout, and resource limits.
- [ ] Mock Docker/Podman subprocesses and assert command arguments are validated and redacted.
- [ ] Test missing binary/daemon, timeout cleanup, invalid image/ports/env/volumes, and status/log fallback.
- [ ] Add optional smoke command for environments with Docker/Podman; never require it in CI.
- [ ] Commit runtime batch.

### Task 5.3 — Lock/lease lifecycle completeness

**Files:**
- Modify: `apps/server/services/project_lock.py`
- Modify: `apps/server/services/remote_state_lock.py`
- Modify: `apps/server/services/cloud_provisioning.py`
- Modify: `apps/server/api/worker_routes.py`
- Modify: `apps/server/app.py` recovery paths
- Create: `apps/server/tests/test_lock_lifecycle.py`

- [ ] Write concurrent tests for same project/state and isolation across projects/states.
- [ ] Store exact lock IDs in execution metadata; do not reconstruct backend key at finish time.
- [ ] Acquire lock atomically with queue reservation/enqueue for mutating actions.
- [ ] Release idempotently on success, failure, cancel, timeout, retry replacement, worker restart, orphan recovery, and deletion.
- [ ] Add expiry cleanup metric and audit event.
- [ ] Commit safety-critical changes only after all lifecycle tests pass.

### Task 5.4 — Fail-closed auth/session revocation

**Files:**
- Modify: `apps/server/auth/service.py:158-177`
- Modify: `apps/server/auth/middleware.py`
- Create: `apps/server/tests/test_session_revocation_failure.py`

- [ ] Write tests for DB revocation failure, file revocation success/failure, token cutoff, and repeated logout.
- [ ] Return a non-success result or explicit degraded state when authoritative revocation cannot be persisted.
- [ ] Emit structured security metric/event without token contents.
- [ ] Ensure middleware behavior is deterministic during storage outage.
- [ ] Commit auth hardening.

### Task 5.5 — Billing/cost error semantics and alert delivery

**Files:**
- Modify: `apps/server/services/budget_service.py`
- Modify: `apps/server/storage/cost_store.py`
- Modify: `apps/server/api/budget_routes.py`
- Create: `apps/server/tests/test_budget_failure_semantics.py`

- [ ] Write tests where KV/cost store fails and assert spend is `unavailable`, not `0.0`.
- [ ] Validate negative, NaN, infinite, and oversized budget input.
- [ ] Make budget alert delivery idempotent and expose retry/DLQ state.
- [ ] Test project aggregation across stacks and notification failure.
- [ ] Commit billing hardening.

### Task 5.6 — Redaction and search safety audit

**Files:**
- Modify: `apps/server/api/platform_contracts.py`
- Modify: runtime providers, audit serializers, `services/global_search.py`
- Create: `apps/server/tests/test_sensitive_data_redaction.py`
- Create: `scripts/check_sensitive_paths.py`

- [ ] Build a matrix for passwords, tokens, provider refs, env values, private keys, encrypted payloads, command lines, and logs.
- [ ] Assert API errors, audit events, search results, operation records, and console/CLI output contain no secret values.
- [ ] Ensure search matches secret metadata/names only; never decrypt or return values.
- [ ] Static-check shell invocation and unsafe command interpolation.
- [ ] Commit redaction changes.

---

# Phase 6 — CI Contract Parity, Failure Drills, and Documentation Cleanup

**Outcome:** CI verifies the whole chain and repository operators can use current paths/configuration without stale or misleading instructions.

### Task 6.1 — OpenAPI snapshot and generated-client freshness gate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/api-contract.yml`
- Create: `scripts/check-openapi-contract.sh`
- Modify: `contracts/radas-api-v2.openapi.json`

- [ ] Start server with PostgreSQL test fixture in CI.
- [ ] Fetch `/api/v2/openapi.json` and compare with the committed snapshot.
- [ ] Fail on duplicate operation IDs, breaking schema change, route missing from spec, or stale generated client.
- [ ] Upload spec diff as CI artifact.
- [ ] Keep security audit overrides and existing build/test jobs intact.
- [ ] Commit workflow separately.

### Task 6.2 — Cross-client contract parity job

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/run-cross-client-contracts.sh`
- Create: `apps/cli/internal/integration/cross_client_test.go`
- Create: `apps/console/src/test/cross-client-fixtures.test.ts`

- [ ] Exercise one login/read/mutation/replay flow through direct HTTP, Go client, and TypeScript client.
- [ ] Assert equivalent status, project scope, request ID, idempotency replay result, and structured error code.
- [ ] Run console typecheck/test/build and Go/worker tests in the same gate.
- [ ] Make failures actionable with endpoint/client/domain labels.
- [ ] Commit CI gate.

### Task 6.3 — Failure/recovery drills

**Files:**
- Create: `apps/server/tests/test_failure_drills.py`
- Create: `apps/worker/internal/integration/recovery_test.go`
- Modify: retry/notification/recovery services

- [ ] Simulate worker crash after claim and verify admission/lock/index/file cleanup.
- [ ] Simulate provider timeout and verify bounded retry/backoff and terminal audit.
- [ ] Simulate notification/webhook failure and verify retry/DLQ or visible failed delivery.
- [ ] Simulate database reconnect and duplicate idempotency request.
- [ ] Assert metrics for queue age, lock contention, recovery count, provider errors, and delivery failures.
- [ ] Commit drills and any fixes separately.

### Task 6.4 — Repair stale paths and developer docs

**Files:**
- Modify: `.github/workflows/chrome-ext-build.yml`
- Modify: `.github/workflows/chrome-ext-release.yml`
- Modify: `scripts/migrate-imports.sh`
- Modify: `docs/postgres-neon.md`
- Modify: `docs/cloudflare-deploy.md`
- Modify: `MIGRATION_GUIDE.md` only where executable instructions are stale
- Modify: `tsconfig.base.json` only after alias usage audit
- Modify: `apps/cli/radas.yml`
- Create: `tests/test_repo_paths.py`

- [ ] Replace stale `apps/opensible-server`/`apps/radas-console` instructions with actual paths where appropriate.
- [ ] Resolve `apps/chrome-ext` references only after checking the actual extension tree and build output.
- [ ] Remove/retire nonexistent aliases or create the packages deliberately; do not leave broken aliases.
- [ ] Point CLI contract discovery to the actual RADAS contract artifact.
- [ ] Add path validation for workflows, scripts, package names, and contract files.
- [ ] Commit docs/config cleanup.

---

# Phase 7 — Product Evidence, Roadmap Reconciliation, and Handoff

**Outcome:** Every claimed completion is backed by code, registered route, client wiring, and a green flow test.

### Task 7.1 — Evidence matrix for P0/P1 roadmap items

**Files:**
- Create: `docs/architecture/roadmap-evidence-matrix.md`
- Modify: `docs/ROADMAP.md`

- [ ] For each P0/P1 item, record implementation paths, registered endpoint, persistence, worker/runtime path, console entry point, CLI command (or API-only classification), and test command.
- [ ] Downgrade `✅` items that have only a stub, partial route, untested UI, or no runtime path to `🔶`/`⬜` with a reason.
- [ ] Mark `✅` only when the acceptance flow passes in the actual app path.
- [ ] Remove contradictory “100% complete” summary until the evidence matrix supports it.
- [ ] Commit evidence docs separately.

### Task 7.2 — End-to-end journey matrix

**Files:**
- Create: `docs/architecture/e2e-flow-matrix.md`
- Create: `apps/server/tests/test_e2e_flow_matrix.py`
- Create: `apps/console/src/test/e2e-flow-matrix.test.tsx`
- Create: `apps/cli/internal/integration/e2e_flow_test.go`

**Journeys:**

- [ ] Login → org/project selection → onboarding → project dashboard.
- [ ] Console create service → queue → worker → runtime → health/logs.
- [ ] CLI same project selection → same service/read/mutation contract.
- [ ] Branch webhook → mapping → preview/production → approval → deploy.
- [ ] Apply/destroy conflict → visible conflict/queued state → release → retry.
- [ ] Provider failure → retry/recovery → terminal audit → notification.
- [ ] Global search → project-scoped detail without secret leakage.
- [ ] Cost store failure → unavailable state → recovery.

Each journey must have server, console, and CLI evidence where that client exposes the journey; otherwise document it as API-only with a reason.

### Task 7.3 — Final verification, graph, and commit hygiene

**Files:**
- Create: `docs/verification/2026-08-27-console-cli-final.md`
- Refresh: `graphify-out/`

- [ ] Run `git diff --check`.
- [ ] Inspect unrelated dirty files and do not stage them accidentally.
- [ ] Run all server tests, compileall, worker Go tests, console typecheck/test/build, vulnerability scan, route inventory, OpenAPI snapshot, and cross-client contract job.
- [ ] Archive exact output and tool versions.
- [ ] Refresh graphify after final commit and verify source commit.
- [ ] Create focused commits per phase; do not squash unrelated changes.
- [ ] Produce a final deferred-P2 list with explicit rationale.

---

## Verification Matrix

The minimum required commands after each relevant phase are:

```bash
# Server
cd apps/server
.venv/bin/python -m compileall -q api api_v2 services storage app.py
.venv/bin/pytest -q

# Worker
cd ../worker
go test ./...

# CLI
cd ../cli
go test ./...

# Console
cd ../console
pnpm typecheck
pnpm test -- --run
pnpm build

# Repository
cd ../..
git diff --check
./scripts/verify-repo-layout.sh
./scripts/vulnerability-scan.sh
graphify update .
```

Live route inventory:

```bash
cd apps/server
.venv/bin/python -c 'from app import app; print(sorted((r.rule, sorted(r.methods-{"HEAD","OPTIONS"})) for r in app.url_map.iter_rules() if r.rule.startswith("/api/")))'
```

Cross-client contract test:

```bash
./scripts/run-cross-client-contracts.sh
```

## Rollback Strategy

- Each phase is committed independently; revert the phase commit rather than manually undoing unrelated work.
- Contract changes are additive under `/api/v2`; rollback removes the v2 consumer/generator gate without changing legacy `/api/*` routes.
- CLI client context changes can be disabled by omitting optional headers only for endpoints explicitly classified as legacy/global; project-scoped routes must fail rather than silently fall back.
- Console UI pages can be feature-flagged/hidden while server routes remain available.
- Runtime provider execution remains disabled unless explicit configuration enables it.
- Database migrations are forward-compatible and must never be rolled back by dropping tables in an automated deployment; use additive columns/tables and a documented repair migration.
- If cross-client CI exposes a breaking contract, stop consumer migration, restore the last generated snapshot, and fix the schema/client adapter before proceeding.

## Definition of Done

- Console and CLI can authenticate independently and target the same server.
- Both clients send consistent project/org/request/idempotency context.
- Every remote CLI mutation has a registered server route, typed error handling, and no fake-success fallback.
- `/api/v2/openapi.json` is stable, required, snapshotted, and consumed by parity tooling.
- Console has test/typecheck/build gates; CLI and worker have Go tests; server has full pytest/compileall gates.
- High-value backend capabilities are reachable from console or explicitly documented as API-only.
- Service/runtime/project/remote-state lock lifecycle is tested across success, failure, cancel, timeout, retry, recovery, and deletion.
- Auth revocation, billing, notification, and provider failures are fail-closed or explicitly observable—not converted to false zero/healthy states.
- Secrets never leak through API, search, audit, logs, client output, or generated artifacts.
- CI verifies route parity, OpenAPI freshness, generated-client freshness, and at least one equivalent flow through Go and TypeScript clients.
- Stale executable paths are removed or intentionally documented as historical.
- Roadmap ✅ statuses are backed by an evidence matrix and green flow tests.
- Graphify is fresh against the final commit.

## Explicit Non-Goals

- No direct browser-to-CLI process execution or untrusted IPC.
- No SumoPod dependency or external runtime delegation.
- No mass rewrite of legacy `/api/*` response shapes.
- No mandatory real cloud or Docker daemon in CI.
- No generated client migration before `/api/v2` schemas and operation IDs are stable.
- No marking every P2 roadmap item complete merely because a similarly named file exists.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-27-radas-console-cli-full-integration.md`.

Two execution options:

1. **Subagent-Driven (recommended):** use `superpowers:subagent-driven-development`, dispatching a fresh implementation agent per task and performing a two-stage review after each task.
2. **Inline Execution:** use `superpowers:executing-plans` and execute the phases in this document with checkpoints.
