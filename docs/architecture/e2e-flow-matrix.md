# End-to-End Flow Matrix (2026-08-27 integration plan, Task 7.2)

Branch: `feat/console-v4-ai-router-clean`. Verification date: 2026-08-28.
Companion: `docs/architecture/roadmap-evidence-matrix.md` (roadmap-level
evidence), `docs/architecture/console-cli-integration-audit-2026-08-27.md`.

Legend: ✅ automated evidence on this branch · 🔶 wired but not fully
automated (reason stated) · API-only = the client does not expose the journey.

## Journey × client matrix

| # | Journey | Server evidence | Console evidence | CLI evidence |
|---|---|---|---|---|
| J1 | Login → org/project selection → dashboard | ✅ `apps/server/tests/test_e2e_flow_matrix.py::test_journey_01_login_project_scope_dashboard` (login, org-scoped project list, foreign project denied, dashboard route) | ✅ `apps/console/src/test/e2e-flow-matrix.test.tsx` J1 (token → scoped projects → selection persisted + `switch` call) | ✅ `apps/cli/internal/integration/e2e_flow_test.go` (login via production client + credential store → org-scoped list → selection) |
| J2 | Create service → queue → worker → health/logs | ✅ `…::test_journey_02_service_deploy_queue_claim_finish` (202 queued → `claim_next_operation` → `finish_operation` → audit events) | ✅ `…test.tsx` J2 (Idempotency-Key sent; queued operation envelope projected) — full worker/runtime rendering is API-only from the console | ✅ `e2e_flow_test.go` J2 (202 deploy + replay keeps operation id; env-gated) |
| J3 | CLI same selection → same read/mutation contract | ✅ server reference half: `tests/test_cli_server_integration.py` | API-only (this journey is the CLI’s; the console meets it through the shared fixture contract) | ✅ `e2e_flow_test.go` J3 (platform envelope read, request-ID pairing) + `cross_client_test.go` parity |
| J4 | Branch webhook → mapping → approval → deploy | ✅ `…::test_journey_04_branch_webhook_mapping_approval_deploy` (signed inbound webhook → execution; branch mapping preview/prod; approval lifecycle; deploy 202) | 🔶 UI pages exist (`system/inbound-webhooks`, `system/branch-mapping`) with page tests; the cross-page composition is API-only because the trigger is server-to-server | API-only (no CLI surface for inbound webhooks by design) |
| J5 | Apply/destroy conflict → visible conflict → release → retry | ✅ `…::test_journey_05_lock_conflict_release_retry` (lock conflict visible, release, retry succeeds) + `tests/test_worker_claim_conflict.py` | 🔶 conflict surfaces on the stack pages via QueryStateView error states (page tests cover the error render, not the live conflict) | ✅ conflict surfaced as 409 with structured code (cross-client fixture `idempotency_conflict` leg) |
| J6 | Provider failure → retry/recovery → terminal audit → notification | ✅ `…::test_journey_06_provider_failure_recovery_notification` (PROVIDER_TIMEOUT audit, DLQ notification, counters) + failure drills | API-only (worker/runtime failures are not console-driven) | API-only (same reason) |
| J7 | Global search → project-scoped detail, no secret leakage | ✅ `…::test_journey_07_global_search_no_secret_leakage` (scoped results, foreign stacks excluded, secret projections carry no name/value/data) | ✅ `…test.tsx` J7 (X-Project-Id scoping, sections render, no secret material in DOM) + `GlobalSearch.test.tsx` | API-only (search is a console surface; CLI parity is contract-level) |
| J8 | Cost store failure → unavailable → recovery | ✅ `…::test_journey_08_cost_store_failure_unavailable_recovery` (`spend: None`, `spend_status: "unavailable"`, recovery to `ok`) | 🔶 budget UI renders `apiErrorTitle`/unavailable states (page test covers error render) | API-only (cost store internals) |

## What the journeys proved beyond their assertions

- **J4 uncovered a real wiring bug**: `services/inbound_webhooks.py` wrote
  registrations to KV but read them from a legacy JSON file, so created
  webhooks were invisible to `trigger()`. Fixed in this task (KV is the store
  of record, legacy file is a read fallback) — without the journey composition
  the unit tests that exercise `trigger` with hand-seeded files would never
  have caught it.
- Journey harness seam (`app_context.set_projects_dir`) is now set explicitly
  by the matrix fixture, so search journeys run without importing `app.py`
  (no background schedulers in tests).

## Offline safety

The server journey file runs under the standard `TEST_DATABASE_URL` gate with
the same fixture strategy as `test_cli_server_integration.py` (real
blueprints, no `app.py` import, isolated `data_dir`). The console journeys run
in the default vitest suite with stubbed fetch. The CLI journey is env-gated
(`RADAS_TEST_*`) and skips cleanly everywhere else, so no journey requires a
live server or cloud credentials to keep the suites green.
