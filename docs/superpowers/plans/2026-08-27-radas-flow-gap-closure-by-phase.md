# RADAS Flow Gap Closure — Phased Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Each task must finish with its own tests and a focused commit.

**Goal:** Menutup gap wiring RADAS dari API → service → storage/worker → console, memperkuat lifecycle/error handling, dan memastikan setiap flow user-facing dapat diverifikasi end-to-end tanpa mengandalkan status roadmap saja.

**Architecture:** RADAS tetap project-centric (`Organization → Project → Service/Stack → Environment → Deployment`). `apps/server` adalah Flask control plane aktual, `apps/worker` adalah eksekutor Go, dan `apps/console` adalah frontend aktual pada checkout ini. API legacy `/api/*` dipertahankan, sementara kontrak baru memakai envelope platform dan idempotency yang eksplisit. Perubahan dilakukan secara incremental: contract inventory dan observability lebih dulu, kemudian lifecycle locks/runtime, wiring console, dan terakhir cleanup dokumentasi/CI.

**Tech Stack:** Python 3.14, Flask, PostgreSQL/psycopg, pytest, Go worker, React 19, TanStack Router/Query, TypeScript, Vite, Docker/Podman CLI, GitHub Actions.

## Global Constraints

- Gunakan path aktual checkout: `apps/server`, `apps/worker`, dan `apps/console`; jangan membuat perubahan berdasarkan path aspiratif `apps/opensible-server` atau `apps/radas-console`.
- PostgreSQL adalah database wajib; schema harus dikelola oleh `apps/server/storage/pg_schema.py` dan migration runner yang ada, bukan tabel manual di production.
- Pertahankan response shape legacy `/api/*`; endpoint baru harus memakai `success_response()`/`error_response()` bila blueprint sudah berada di kontrak platform.
- Semua route project-scoped wajib memvalidasi tenant/project access dan tidak boleh membocorkan secret, token, credential, atau payload sensitif.
- Semua mutating service operation wajib idempotent, memiliki actor/request correlation, dan melepaskan lock/lease pada success, failure, cancel, timeout, retry, dan worker recovery.
- Jangan menandai roadmap ✅ hanya karena file atau route ada; status harus didukung test atau bukti runtime end-to-end.
- Jangan mengaktifkan Docker/Podman execution tanpa explicit configuration gate dan timeout/resource limits.
- Jangan mengubah file/image yang sudah dirty pada awal pekerjaan tanpa memilah ownership perubahan terlebih dahulu.
- Setelah perubahan kode, jalankan `graphify update .` dan pastikan header graph menunjuk commit terbaru.

## Baseline Evidence and Gap Inventory

Temuan yang menjadi dasar plan ini:

1. `apps/server/app.py:67-80` menangkap kegagalan registrasi seluruh blueprint dan tetap menjalankan server dengan legacy routes; `apps/server/api/__init__.py:125-133` juga menelan kegagalan per blueprint. Ini dapat menghasilkan API parsial tanpa readiness failure.
2. `apps/server/services/runtime_registry.py:424-436` hanya mendaftarkan `local-container` bila `enable_local_container=True`; caller observability tidak otomatis membuktikan provider tersebut reachable. `LocalContainerProvider` harus diuji dari registry sampai operation runner.
3. `apps/server/services/cloud_provisioning.py` dan `apps/server/services/branch_mapping.py` memiliki bagian branch/remote-state, tetapi perlu flow test webhook → mapping → execution.
4. Backend memiliki capability yang belum konsisten terlihat di `apps/console/src`: bastion, retry policy, automation rules, MFA, provider mirror, audit export, inbound webhook management, branch mapping, dan beberapa environment controls.
5. `apps/console/package.json:5-10` tidak memiliki test script; typecheck saja tidak memverifikasi route/API wiring.
6. `apps/server/services/budget_service.py:18-25,56-69,80-90` dan `apps/server/auth/service.py:167-174` menelan error storage/notification/auth sehingga failure dapat tampak sebagai state kosong atau spend nol.
7. Schema untuk onboarding/locks tampak didefinisikan di `pg_schema.py`, sementara SQL terpisah juga ada; canonical migration path harus diuji.
8. `graphify-out/GRAPH_REPORT.md:13` dibangun dari commit lama `9c3df12a`, sedangkan baseline audit berjalan pada commit berbeda; graph harus diregenerasi setelah tiap batch besar.

---

# Phase 0 — Contract Freeze, Inventory, and Safety Gates

**Outcome:** Satu sumber kebenaran kontrak dan startup/readiness yang tidak diam-diam kehilangan route.

### Task 0.1 — Freeze route and response contracts

**Files:**
- Modify: `apps/server/api/platform_contracts.py`
- Modify: `apps/server/api/__init__.py:19-133`
- Modify: `apps/server/app.py:67-92`
- Create: `apps/server/tests/test_contract_inventory.py`
- Create: `docs/architecture/api-contract-inventory.md`

**Steps:**

- [ ] Enumerate `app.url_map` in a test and snapshot route, methods, endpoint name, blueprint, auth requirement, project-scope requirement, and response envelope.
- [ ] Classify blueprints as `required` (auth, projects, executions, worker, readiness, service operations) or `optional` (integrations whose dependencies may be absent).
- [ ] Replace broad silent startup continuation for required blueprints with a startup error or readiness failure carrying a stable error code; keep optional modules logged and skipped.
- [ ] Add `GET /readyz` assertions that required route registration and database readiness are both true.
- [ ] Add a contract inventory document listing legacy and new endpoint families, request fields, status codes, and redaction rules.

**Test gate:**

```bash
cd apps/server
.venv/bin/pytest -q tests/test_contract_inventory.py tests/test_platform_contracts.py
.venv/bin/python -m compileall -q api api_v2 services storage app.py
```

**Acceptance:** A missing required blueprint makes readiness fail; optional integrations remain non-fatal; route snapshot catches accidental removal or duplicate route ownership.

### Task 0.2 — Canonical migration reproducibility

**Files:**
- Modify: `apps/server/storage/pg_schema.py`
- Review/remove duplication: `apps/server/storage/migrations/*.sql`
- Create: `apps/server/tests/test_schema_reproducibility.py`

**Steps:**

- [ ] Document whether `pg_schema.py` or numbered SQL files are canonical; choose one migration authority.
- [ ] Ensure onboarding, project lock, remote-state lock, service, and observability tables are created by the same fresh-install and upgrade paths.
- [ ] Run migration twice and assert idempotence; run from empty schema and assert all expected tables/indexes exist.
- [ ] Add a migration version check to readiness output without exposing connection credentials.

**Acceptance:** Fresh and upgrade schema paths produce the same table/index set; a second migration run makes no destructive changes.

### Task 0.3 — Baseline quality and graph freshness

**Files:**
- Create: `docs/architecture/flow-gap-baseline-2026-08-27.md`
- Refresh: `graphify-out/`

**Steps:**

- [ ] Record baseline commands and outputs: server focused tests, console typecheck, compileall, route inventory, and dirty-tree ownership.
- [ ] Run `graphify update .`.
- [ ] Store the source commit and unresolved baseline gaps in the audit document.

**Acceptance:** Future batches can distinguish pre-existing failures from regressions.

---

# Phase 1 — Runtime, Admission, and Lock Lifecycle

**Outcome:** Mutating operations cannot bypass runtime selection or leak project/remote-state capacity.

### Task 1.1 — Make runtime provider selection explicit and reachable

**Files:**
- Modify: `apps/server/services/runtime_registry.py:424-436`
- Modify: `apps/server/services/service_operation_runner.py`
- Modify: `apps/server/services/service_observability.py`
- Modify: `apps/server/services/runtime_providers/local_container.py`
- Create: `apps/server/tests/test_runtime_provider_reachability.py`

**Steps:**

- [ ] Define one configuration source for `enable_local_container`, runtime (`docker`/`podman`), socket, network, and command timeout.
- [ ] Pass the same provider configuration from operation runner and observability instead of constructing an always-mock default registry.
- [ ] Return a stable `PROVIDER_DISABLED`/`RUNTIME_UNAVAILABLE` status when disabled or binary missing.
- [ ] Validate image, ports, env, volumes, labels, and container name before invoking subprocesses.
- [ ] Ensure subprocess timeouts kill/clean up the child and redact command arguments in logs.

**Test gate:** mock `shutil.which` and subprocess calls; no Docker daemon required.

```bash
cd apps/server
.venv/bin/pytest -q tests/test_runtime_provider_reachability.py tests/test_runtime_registry.py tests/test_service_operation_execution.py
```

**Acceptance:** An enabled local provider can be selected by a real service operation; a disabled/missing runtime never reports a false successful deploy.

### Task 1.2 — Atomic project and remote-state lock lifecycle

**Files:**
- Modify: `apps/server/services/project_lock.py`
- Modify: `apps/server/services/remote_state_lock.py`
- Modify: `apps/server/services/cloud_provisioning.py`
- Modify: `apps/server/api/worker_routes.py`
- Modify: `apps/server/app.py` recovery paths
- Create/extend: `apps/server/tests/test_project_lock.py`, `test_remote_state_lock.py`, `test_lock_lifecycle.py`

**Steps:**

- [ ] Carry lock IDs/reference IDs in the execution record instead of reconstructing backend identity at finish time.
- [ ] Acquire project and remote-state locks in the same transaction as queue reservation/enqueue for mutating actions.
- [ ] Release by exact lease ID and make release idempotent.
- [ ] Add release calls to success, failure, cancel, timeout, retry replacement, worker restart/orphan recovery, and deletion.
- [ ] Add expiry cleanup and metrics for lock acquisition failures and forced cleanup.
- [ ] Verify project isolation and same-state serialization with concurrent PostgreSQL transactions.

**Acceptance:** Every terminal path leaves zero active lock leases for the completed execution; a crashed worker is recoverable without manual database cleanup.

---

# Phase 2 — End-to-End Execution and Branch/VCS Wiring

**Outcome:** User-triggered and webhook-triggered deployments follow one complete, observable path.

### Task 2.1 — Branch mapping through webhook to execution

**Files:**
- Modify: `apps/server/services/branch_mapping.py`
- Modify: `apps/server/api/branch_mapping_routes.py`
- Modify: `apps/server/services/inbound_webhooks.py`
- Modify: `apps/server/api/inbound_webhook_routes.py`
- Modify: `apps/server/services/cloud_provisioning.py`
- Create: `apps/server/tests/test_branch_mapping_flow.py`

**Steps:**

- [ ] Define webhook payload contract: repository, ref/branch, event, project, stack, and action.
- [ ] Verify HMAC before parsing or triggering a run.
- [ ] Resolve branch with ordered, anchored patterns; reject ambiguous duplicate priority rules.
- [ ] Persist resolved branch, environment, mapping rule ID, and source event ID on execution metadata.
- [ ] Use one idempotency key derived from provider event ID to prevent duplicate deployment.
- [ ] Return a public response containing execution ID and mapped environment only.

**Test gate:**

```bash
cd apps/server
.venv/bin/pytest -q tests/test_branch_mapping.py tests/test_branch_mapping_flow.py tests/test_inbound_webhooks.py
```

**Acceptance:** `push main` maps to production, `pull_request` maps to preview, an invalid signature is rejected, and replaying the same event does not create a second execution.

### Task 2.2 — Full service vertical slice with health and logs

**Files:**
- Modify: `apps/server/services/service_operation_runner.py`
- Modify: `apps/server/services/service_observability.py`
- Modify: `apps/server/api/service_observability_routes.py`
- Modify: `apps/server/services/runtime_providers/local_container.py`
- Create/extend: `apps/server/tests/test_service_operation_execution.py`, `test_service_observability.py`

**Steps:**

- [ ] Test API create → queued operation → worker claim → provider deploy → instance running.
- [ ] Test provider health/status updates and stored observation fallback.
- [ ] Test live logs plus historical operation events with bounded pagination.
- [ ] Test provider failure transitions instance/operation to terminal failure and releases all leases.
- [ ] Test destroy/cancel/retry and idempotency behavior.

**Acceptance:** One test demonstrates the complete flow without directly mutating database status to simulate success.

---

# Phase 3 — Frontend Wiring and Console Test Harness

**Outcome:** Backend capabilities are reachable from the actual console and protected by automated UI/API contract tests.

### Task 3.1 — Add console test harness

**Files:**
- Modify: `apps/console/package.json`
- Create: `apps/console/vitest.config.ts`
- Create: `apps/console/src/test/setup.ts`
- Create: `apps/console/src/lib/api.test.ts`
- Create: `apps/console/src/routes/__root.test.tsx`

**Steps:**

- [ ] Add Vitest, React Testing Library, and jsdom using existing package-manager constraints.
- [ ] Add `test` and `test:watch` scripts without changing the existing Vite build.
- [ ] Test API error/envelope parsing, token expiry, and project header propagation.
- [ ] Test root auth/onboarding redirect decisions with mocked query responses.
- [ ] Add a route smoke test that renders every primary navigation target.

**Test gate:**

```bash
cd apps/console
pnpm typecheck
pnpm test -- --run
pnpm build
```

**Acceptance:** CI can detect a broken route import, API path, or response-shape change before deployment.

### Task 3.2 — Wire high-value backend capabilities

**Files:**
- Create/modify pages under `apps/console/src/routes/` for:
  - `audit` / audit export
  - `automation`
  - `retry-policy`
  - `inbound-webhooks`
  - `branch-mapping`
  - `bastion`
  - `mfa`
  - `provider-mirror`
- Modify: `apps/console/src/components/app-shell/NavSections.tsx`
- Modify: `apps/console/src/components/app-shell/Breadcrumbs.tsx`

**Steps:**

- [ ] Add route-level loading, empty, unauthorized, and server-error states.
- [ ] Use the exact backend endpoint contracts; do not duplicate server-side validation in a divergent format.
- [ ] Add create/edit/delete/rotate/approve actions only where backend permissions support them.
- [ ] Implement breadcrumbs from route metadata instead of the current null placeholder.
- [ ] Add UI feature-flag gating where required, with safe default-hidden behavior.

**Acceptance:** Every listed backend capability has either a usable console flow or an explicit documented API-only classification.

### Task 3.3 — Console search and project landing integration

**Files:**
- Modify: `apps/console/src/routes/dashboard.tsx` or actual dashboard route
- Create: `apps/console/src/components/search/GlobalSearch.tsx`
- Modify: `apps/console/src/lib/query.ts`
- Create: `apps/console/src/components/search/GlobalSearch.test.tsx`

**Steps:**

- [ ] Connect `/api/search` to keyboard-accessible command/search UI.
- [ ] Render result types separately (stack, run, secret) and never render secret values.
- [ ] Link each result to the correct project-scoped detail route.
- [ ] Add debounce, cancellation, minimum query length, result limits, and empty state.
- [ ] Ensure dashboard widgets use the same project identity and query cache keys.

**Acceptance:** Search works from any authenticated project view and cannot cross tenant boundaries.

---

# Phase 4 — Error Handling, Security, and Billing Correctness

**Outcome:** Infrastructure, auth, and cost failures are observable and do not silently turn into safe-looking false data.

### Task 4.1 — Fail-closed authentication/session revocation

**Files:**
- Modify: `apps/server/auth/service.py:158-177`
- Modify: `apps/server/auth/middleware.py`
- Create: `apps/server/tests/test_session_revocation_failure.py`

**Steps:**

- [ ] Define behavior when file and PostgreSQL revocation stores disagree.
- [ ] Record a structured security error/metric when DB revocation update fails.
- [ ] Ensure logout-all does not claim success if the authoritative revocation write failed.
- [ ] Test token cutoff, session row update, retry, and readiness/alert behavior.

**Acceptance:** A failed revocation write cannot silently report successful global logout.

### Task 4.2 — Billing/cost data integrity

**Files:**
- Modify: `apps/server/services/budget_service.py`
- Modify: `apps/server/storage/cost_store.py`
- Modify: `apps/server/api/budget_routes.py`
- Create: `apps/server/tests/test_budget_failure_semantics.py`

**Steps:**

- [ ] Replace broad `{}`/`0.0` fallbacks with typed unavailable/error states.
- [ ] Preserve budget amount/currency but mark spend as `unknown` if cost storage fails.
- [ ] Make alert delivery idempotent and record failed dispatches for retry/DLQ.
- [ ] Validate negative, NaN, infinite, and oversized budget inputs.
- [ ] Add a project-level aggregation test across multiple stacks/estimates.

**Acceptance:** Cost store outage never appears as zero spend or a silently healthy budget.

### Task 4.3 — Secrets, redaction, and subprocess audit

**Files:**
- Modify: `apps/server/api/platform_contracts.py`
- Modify: `apps/server/services/runtime_providers/local_container.py`
- Modify: relevant logs/audit serializers
- Create: `apps/server/tests/test_sensitive_data_redaction.py`

**Steps:**

- [ ] Build a sensitive-field test matrix covering tokens, passwords, private keys, env values, provider refs, and command lines.
- [ ] Verify error responses and audit events use the same redactor.
- [ ] Ensure search indexes secret names/metadata only, never secret values.
- [ ] Add static checks for subprocess shell execution and unsafe interpolation.

**Acceptance:** Secret values do not appear in API responses, logs, search results, operation events, or test snapshots.

---

# Phase 5 — CI/CD, Reliability, and Operational Readiness

**Outcome:** The repository can be built, tested, migrated, and deployed using current paths with reliable regression gates.

### Task 5.1 — Repair stale CI/docs/workspace paths

**Files:**
- Modify: `.github/workflows/chrome-ext-build.yml`
- Modify: `.github/workflows/chrome-ext-release.yml`
- Modify: `scripts/migrate-imports.sh`
- Modify: `docs/postgres-neon.md`
- Modify: `docs/cloudflare-deploy.md`
- Modify: `tsconfig.base.json` only after confirming aliases are needed
- Modify: `pnpm-workspace.yaml`
- Create: `tests/test_repo_paths.py` or equivalent shell validation

**Steps:**

- [ ] Replace nonexistent `apps/opensible-server` references with `apps/server` where that is the actual runtime path.
- [ ] Replace stale `apps/chrome-ext` references with the actual extension path only after checking current tree; do not assume WXT output layout.
- [ ] Remove or implement nonexistent aliases `@radas/api-client`, `@radas/module-projects`, `@radas/module-users`, `@radas/module-wiki`.
- [ ] Validate every CI path exists and every referenced package script exists.
- [ ] Keep security overrides in root package configuration intact.

**Acceptance:** Path validation fails on stale references; CI workflow changed-path filters match actual directories.

### Task 5.2 — Full server/worker regression gates

**Files:**
- Modify: `apps/server/pytest.ini` only if needed
- Modify: CI workflow files
- Create: `scripts/verify-flow-gates.sh`

**Steps:**

- [ ] Run server full test suite against PostgreSQL test database.
- [ ] Run compileall and route inventory.
- [ ] Run `apps/worker/go test ./...`.
- [ ] Run console typecheck, tests, and build.
- [ ] Run vulnerability scan and record tool/version output.
- [ ] Fail CI on missing required route, migration failure, typecheck failure, or critical/high vulnerability.

**Commands:**

```bash
cd apps/server && .venv/bin/pytest -q
cd apps/server && .venv/bin/python -m compileall -q api api_v2 services storage app.py
cd ../worker && go test ./...
cd ../console && pnpm typecheck && pnpm test -- --run && pnpm build
cd ../.. && ./scripts/vulnerability-scan.sh
```

**Acceptance:** One green gate covers the complete repository flow rather than isolated feature tests only.

### Task 5.3 — Recovery, retry, and alert drills

**Files:**
- Modify: `apps/server/services/retry_policy.py`
- Modify: `apps/server/services/automation_rules.py`
- Modify: worker recovery and notification services
- Create: `apps/server/tests/test_failure_drills.py`

**Steps:**

- [ ] Simulate worker crash after claim and verify lease/index/file recovery.
- [ ] Simulate provider timeout and verify bounded retry/backoff.
- [ ] Simulate webhook/notification failure and verify retry/DLQ or visible failure state.
- [ ] Simulate database reconnect and ensure no duplicate execution.
- [ ] Emit metrics for queue age, lock contention, provider errors, recovery count, and alert delivery failure.

**Acceptance:** Every drill produces deterministic state, an audit event, and an actionable metric/log.

---

# Phase 6 — Roadmap Reconciliation and Product Completeness

**Outcome:** Roadmap statuses reflect verified flows, not optimistic file presence.

### Task 6.1 — Reconcile all P0/P1 roadmap items

**Files:**
- Modify: `docs/ROADMAP.md`
- Create: `docs/architecture/roadmap-evidence-matrix.md`

**Steps:**

- [ ] For each P0/P1 item, record implementation files, endpoint, UI entry point, persistence, worker/runtime path, and tests.
- [ ] Downgrade items with only partial/backend-only implementation from ✅ to 🔶 or ⬜.
- [ ] Mark ✅ only when the acceptance test passes and the route is registered in the active app.
- [ ] Link each completed item to its evidence test and verification command.
- [ ] Remove contradictory “100% complete” summary until all evidence rows satisfy the same rule.

**Acceptance:** A reviewer can select any ✅ item and trace it through code and a green test.

### Task 6.2 — End-to-end user journey matrix

**Files:**
- Create: `docs/architecture/e2e-flow-matrix.md`
- Create: `apps/server/tests/test_flow_matrix.py`
- Create: `apps/console/src/test/flow-matrix.test.tsx`

**Journeys:**

- [ ] Login → org/project selection → onboarding → project dashboard.
- [ ] Create stack/service → configure → review → queue → worker execution → health/logs.
- [ ] Branch webhook → mapping → preview/production environment → approval → deploy.
- [ ] Apply/destroy concurrency conflict → visible 409/queued state → release → retry.
- [ ] Provider failure → retry/recovery → terminal audit event → notification.
- [ ] Global search → project-scoped result → detail page without secret leakage.
- [ ] Budget/cost store failure → unavailable state → recovery.

**Acceptance:** Each journey has a server integration test, console test, and documented manual verification fallback if external infrastructure is unavailable.

### Task 6.3 — Final audit and handoff

**Steps:**

- [ ] Run `git diff --check` and inspect all unrelated dirty files before committing.
- [ ] Run graph refresh and verify graph source commit equals `git rev-parse HEAD`.
- [ ] Run the full verification matrix and archive outputs under `docs/verification/`.
- [ ] Update `AGENTS.md` only if actual repository layout has intentionally changed.
- [ ] Commit each phase in focused commits; do not squash unrelated frontend assets or user changes.
- [ ] Produce a final gap report listing any intentionally deferred P2 work.

---

## Execution Order and Commit Boundaries

1. Phase 0.1–0.3: contracts/schema/baseline. Commit: `chore(contract): freeze active API and migration inventory`.
2. Phase 1.1–1.2: runtime and lock lifecycle. Commit separately because lock changes affect safety-critical paths.
3. Phase 2.1–2.2: branch/VCS and service execution flows.
4. Phase 3.1–3.3: console test harness and UI wiring.
5. Phase 4.1–4.3: auth/billing/redaction hardening.
6. Phase 5.1–5.3: CI, full regression, recovery drills.
7. Phase 6.1–6.3: roadmap evidence and final handoff.

Every task follows this TDD loop:

```text
write failing test → run focused test and capture failure → implement smallest safe change
→ run focused test → run adjacent regression tests → inspect diff → commit
```

## Definition of Done

- No required blueprint can fail registration while the server still reports ready.
- Fresh and upgrade PostgreSQL migrations are reproducible and idempotent.
- Service, legacy, branch-webhook, and mutating cloud flows have end-to-end tests.
- Project and remote-state locks release exactly once on every terminal/recovery path.
- Local runtime activation is explicit, observable, bounded, and tested without requiring Docker in CI.
- Every user-facing backend capability is wired in console or documented as API-only.
- Console has typecheck, unit/component tests, and build gates.
- Auth, cost, notification, and secret failures cannot silently become false healthy/zero states.
- Roadmap ✅ statuses link to actual evidence; no stale path/documentation references remain in active CI/scripts.
- Final graph is fresh and all verification outputs are archived.

## Deliberate Non-Goals

- Do not add a SumoPod dependency or external runtime delegation.
- Do not rewrite all legacy `/api/*` response shapes in one batch.
- Do not implement every P2 roadmap item before the flow gaps above are closed.
- Do not treat a real Docker daemon deployment as a required CI gate; use subprocess mocks in CI and a separately documented smoke test for environments that opt in.
