# Final Verification — 2026-08-27 Console/CLI Full Integration Plan

Branch: `feat/console-v4-ai-router-clean`
Verification run: 2026-08-28
Plan: `docs/superpowers/plans/2026-08-27-radas-console-cli-full-integration.md`

## Tool versions

| Tool | Version |
|---|---|
| Python (server venv) | 3.14.6 |
| Node | 22.23.1 |
| pnpm | 11.24.0 |
| Go (CLI + worker) | go1.25.5 darwin/arm64 |

Environment for the server suite: `TEST_DATABASE_URL=sqlite:///:memory:`,
`JWT_SECRET_KEY` / `INTERNAL_CALL_SECRET` / `GLOBAL_SECRETS_ENCRYPTION_KEY`
set to CI-style test values (same pattern as `.github/workflows/api-contract.yml`).

## Gate results

| Gate | Command | Result |
|---|---|---|
| `git diff --check` | — | clean |
| Server compileall | `python -m compileall -q api services storage auth app.py` | OK |
| Server full suite | `pytest -q` | **1148 collected; 1147 passed, 1 failed** — the single failure (`test_cli_auth_contract.py::test_cli_auth_lifecycle_login_use_refresh_logout`) is caused by the operator's uncommitted `apps/server/api/auth_routes.py` change; verified **1 passed** with that working-tree change stashed (committed code is green) |
| Route parity | `apps/server/scripts/check_route_parity.py` | OK — commands=65 (42 remote matched, 23 local classified), exit 0 |
| OpenAPI snapshot pin | `pytest tests/test_openapi_snapshot_served.py` | OK (byte-identical to `contracts/radas-api-v2.openapi.json`) |
| Compose contract | `pytest tests/test_compose_config.py` | OK (repaired to `apps/server/docker-compose.yml` this plan) |
| Repo path integrity | `pytest ../../tests/test_repo_paths.py` | OK (11 tests) |
| Server failure drills | `pytest tests/test_failure_drills.py` | OK (7 tests) |
| E2E journey matrix (server) | `pytest tests/test_e2e_flow_matrix.py` | OK (7 tests) |
| Worker Go suite | `go test ./...` (apps/worker) | OK, incl. `internal/recovery` drills |
| CLI Go suite | `go vet ./... && go test ./...` (apps/cli) | OK; integration tests skip cleanly without `RADAS_TEST_*` |
| Console typecheck | `pnpm typecheck` (working tree) | 2 errors in the operator's uncommitted `src/routes/login.tsx`; verified clean (exit 0) on the committed tree via a HEAD worktree |
| Console vitest | `pnpm test` | 17 files — **118 passed, 4 skipped** (env-gated real-HTTP legs) |
| Console build | `pnpm build` | OK (vite production build, 4.42s) |
| Cross-client fixture legs | `vitest run src/test/cross-client-fixtures.test.ts`, `go test ./internal/integration/` | OK (9 passed / 4 env-gated skipped; Go legs pass with clean skips) |

Note on a stale-environment false positive: `test_global_secret_key_routes.py`
hardcoded the conftest-default `X-Internal-Call` secret, so it failed whenever
`INTERNAL_CALL_SECRET` was overridden (as CI does). Fixed during final
verification to derive the header from the runtime env; both tests pass under
the CI-style environment.

## Method notes

- The committed tree was verified separately from the operator's dirty working
  tree: typecheck ran in a `git worktree` at HEAD (clean), and the auth
  lifecycle test ran with the dirty file stashed (1 passed).
- Full-suite runs must not share the machine with other pytest processes: two
  concurrent runs reset each other's PostgreSQL test schema and produce
  spurious ERRORs (observed once; clean isolated run is authoritative).

## Deferred findings (P2) carried to the final review

1. **Notification fan-out is per-channel bespoke.** Webhook DLQ exists
   (UC404) and budget alerts have their own DLQ + dedupe, but there is no
   unified delivery-failure surface beyond the new `webhook_delivery_failures_total`
   counter. Rationale for deferral: each channel's failure semantics are now
   truthful and observable; unifying is a product decision, not a correctness gap.
2. **`server_recover_stuck_executions` is file-walk based** and re-scans every
   project directory on each interval. Rationale: correct and gated by drills;
   making it event-driven is an optimization, not a failure-semantics fix.
3. **Route parity informational output is large** (1204 informational lines).
   Rationale: the gate's exit status is the contract; the verbose listing is
   debug-only.
4. **`radas.yml` still names the project "investrack"** while the repo is
   RADAS; only the contract paths were corrected (Task 6.4 scope). Renaming
   the descriptor is cosmetic.
5. **Console typecheck in CI mode (a) would fail on the dirty working tree**
   today only because of uncommitted operator edits; the committed tree is
   clean. Re-run `scripts/run-cross-client-contracts.sh` after landing the
   operator's console changes.
6. **Worker recovery (Go) and server recovery (Python) duplicate the
   RUNNING/CANCELING timeout semantics** in two languages by design (the Go
   worker treats execution JSON as opaque). Both sides now have drill coverage;
   a shared specification test would be nice-to-have.
