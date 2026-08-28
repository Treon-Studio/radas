# Roadmap Evidence Matrix (2026-08-27 integration plan, Task 7.1)

Branch: `feat/console-v4-ai-router-clean`. Verification date: 2026-08-28.
Companion: `docs/architecture/e2e-flow-matrix.md` (journey-level evidence),
`docs/architecture/console-cli-integration-audit-2026-08-27.md` (the audit
whose findings this matrix tracks to closure).

## Methodology

A roadmap row earns ✅ only when the acceptance flow passes in the actual app
path with all of the following evidence recorded. Anything less is 🔶 (partial,
reason stated) or ⬜ (not started).

| Evidence layer | What must exist |
|---|---|
| Implementation | Concrete file paths (server service + route, worker/runtime, console page, CLI command) |
| Contract | Route served by the real app (`app.url_map` / served OpenAPI snapshot) and matched by `contracts/cli-route-manifest.json` |
| Persistence | PostgreSQL schema authority (`storage/pg_schema.py`) or explicit file/KV store |
| Test | A command that runs green on this branch (pytest / vitest / go test) |

Branch-wide gates that apply to every item below (all green):

- Served OpenAPI snapshot byte-pinned: `apps/server/tests/test_openapi_snapshot_served.py` (444 paths / 549 ops).
- CLI route parity: `apps/server/scripts/check_route_parity.py` exit 0 (42 remote / 23 local commands).
- Redaction matrix: 45 tests (`apps/server/api/platform_contracts.py`).
- CI gates: `.github/workflows/api-contract.yml`, `cross-client-contracts` job in `ci.yml` running `scripts/run-cross-client-contracts.sh` mode (a).
- Cross-client parity: `contracts/cross-client-fixtures.json` with Go leg (`apps/cli/internal/integration/cross_client_test.go`) and TypeScript leg (`apps/console/src/test/cross-client-fixtures.test.ts`).

## Section-level evidence (ROADMAP sections A–Q)

| Section | Implementation paths (verified present) | Test evidence (green on this branch) |
|---|---|---|
| A. Provisioning & IaC | `services/cloud_provisioning.py`, `api/worker_routes.py`, worker `internal/claim`+`internal/execute`, console cloud routes, CLI `cmd/stack` | `tests/test_cloud_provisioning*.py`, lock-lifecycle suite (below) |
| B. Configuration Mgmt | `services/` playbook runners, worker ansible exec, CLI `cmd/playbook` | `tests/test_playbook*.py` |
| C. Cost & FinOps | `services/budget_service.py` (hardened 9ccee875), cost store | `tests/test_budget*.py` green; **analytics rows downgraded — see below** |
| D. Secrets | `services/secrets*`, `auth/`, redaction matrix 409f9211 | `tests/test_secrets*.py`, `tests/test_redaction*.py` |
| E. CI/CD & GitOps | `api/pipeline_routes.py`, branch mapping, inbound webhooks | `tests/test_inbound_webhooks*.py`, console page tests |
| F. Operations & Observability | `services/metrics.py` (+failure counters 25244a03), `api/metrics_routes.py` | `tests/test_failure_drills.py` |
| G. Multi-tenancy | `orgs`/`org_members` schema, `require_project_access`, JWT org claims | `tests/test_auth_lifecycle*.py`, contract tests |
| H. Automation/Scheduler | `services/scheduler*` | partial — see downgrades |
| I. AI & DX | CLI generators (`cmd/frontend/gen_api.go` etc.) | route parity (local classification); AI rows not e2e-verified |
| J. Integration | `services/webhook_dispatcher.py` (DLQ UC404), API tokens | `tests/test_failure_drills.py`, `tests/test_notification_service.py` |
| K. Feature Flags | `services/feature_flags.py` + registry | `tests/test_feature_flags*.py` |
| L. Test Case Mgmt | `services/test_cases.py`, checkov/tfsec scans (5400c54) | `tests/test_test_cases*.py` |
| M. GitHub Actions Mgmt | `api/` + `services/` actions modules | route parity; UI pages wired with tests |
| N. BYOC Import | import services + routes | route parity; registry suite |
| O. Competitor Parity | per-feature, see sections above | mixed — not individually re-verified |
| P. Reliability/UX | lock lifecycle (799f3e23), admission (UC483), recovery, retry, idempotency, budget, redaction | `tests/test_failure_drills.py` + admission suites |
| Q. Code Registry | `api/code_registry_routes.py`, private modules (de2d1dd/f2bbf14) | registry tests green |

## Per-item evidence — rows verified on this branch

| # | Use case | Status | Evidence |
|---|---|---|---|
| 62 | Prometheus export | ✅ | `services/metrics.py` renders queue age, admission leases, recovery/contention/provider/delivery counters; asserted by `tests/test_failure_drills.py::test_drill_metrics_surface_queue_age_and_lock_contention` |
| 30 | Budget & alert threshold | ✅ | `services/budget_service.py`: `spend: None` + `spend_status: "unavailable"` on cost-store failure, alert DLQ + dedupe (`ALERT_DEDUPE_SECONDS=3600`), amount validation (9ccee875) |
| 95 | Outbound webhooks | ✅ | `services/webhook_dispatcher.py` + HMAC signing; DLQ drill green |
| 404 | Webhook retry + DLQ | ✅ | Drill: 3 bounded attempts → DLQ entry visible → clear (`tests/test_failure_drills.py::test_drill_webhook_failure_retries_then_dlq`), delivery-failure counter |
| 458 | Idempotency cache | ✅ | Drill: duplicate request replays cached response verbatim after connection-pool reset (`test_drill_db_reconnect_duplicate_idempotency`) |
| 477 | Worker restart recovery | ✅ | Server drill (`test_drill_worker_queue_recovery_requeues_and_counts`) + worker drill (`apps/worker/internal/recovery/recovery_test.go`); requeue counter |
| 478 | Claim conflict backoff | ✅ | `tests/test_worker_claim_conflict.py` green (regression run 2026-08-28) |
| 482 | Retry policy per stack | 🔶 | Routes + console page verified (`tests/test_retry_policy_routes.py`, console page tests); **multi-process scheduler coverage unverified** |
| 483 | Concurrency limit per project | ✅ | Shared admission leases for service + legacy claims; full release/recovery matrix (`tests/test_project_admission*.py`, `tests/test_service_operation_runner.py`) + crash drill; lock lifecycle (799f3e23) |
| 583 | Retry with jitter | ✅ | `services/retry_engine.py`; bounded-attempts drill green |
| 393 | Project dashboard | ✅ | Console dashboard + global search integration (`09021473`), `apps/console/src/test/project-flow.test.tsx` green; E2E-with-credentials variant documented in e2e matrix |

## Closed audit findings (console-cli-integration-audit-2026-08-27)

| Audit finding | Closure |
|---|---|
| CLI sends no project/request context | `client.Config{ProjectID, OrganizationID, RequestID, TraceID}` + `RequestOptions{IdempotencyKey}`; single header-application point in `newRequest` (Phase 1) |
| CLI has no login/refresh | `radas auth login/refresh/status/logout`, 0600 credential file, `DoWithRefresh`, fail-closed `SessionRevocationError` (Phase 3 + a64863eb) |
| CLI routes mismatch server routes | `contracts/cli-route-manifest.json` + `check_route_parity.py` gate, exit 0 (Phase 2) |
| Split error contracts (legacy vs platform) | `/api/v2/*` platform envelopes fail-closed via `is_platform_request()`; served snapshot pinned (Phase 2, 54c68ef9) |
| Console missing tenant headers / idempotency | `lib/api.ts` Bearer + X-Project-Id + Idempotency-Key passthrough; pages wired with QueryStateView + ConfirmDialog (Phase 4) |
| Silent blueprint registration | `register_blueprints(strict_required=True)`, registry report written before contract registration (Task 0.2) |

## Downgrades (✅ → 🔶) and reasons

| # | Use case | Reason |
|---|---|---|
| 29 | Trending & forecast biaya | No verified runtime path or e2e test; cost-store failure semantics only recently made truthful (spend unavailable) — analytics consume an unverified pipeline |
| 31 | Breakdown biaya per tag/role | Same as 29 |
| 33 | Rollup biaya multi-project/org | Same as 29 |
| 482 | Retry policy per stack | Scheduler multi-process coverage unverified (see per-item table) |

Phase-level verification pending (rows not individually downgraded, recorded
here so the summary stays honest): Phase 3 cost/FinOps e2e verification,
Phase 4 runtime adapter acceptance flows, Phase 5 all-in-one catalog/billing.

## Summary correction

The previous ROADMAP summary claimed "100% across all phases". That claim is
replaced by a pointer to this matrix; the accurate statement is: all roadmap
rows are implemented and the branch-wide contract/reliability gates are green,
with the downgrades and pending-verification phases listed above.
