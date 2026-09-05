# Elixir Migration — Phase 8 Ledger (Flask Decommission) — COMPLETE

Status per 2026-09-04, branch `feat/elixir-migration-phase0`.
Suite 344 ExUnit green; smoke / path-guards / sensitive-path gates pass.

## FINAL STATE: `apps/server/` HAS BEEN PHYSICALLY REMOVED

The exit criteria below are all met:

1. ✅ Deferred parity ledger empty — every remote CLI command in
   `contracts/cli-route-manifest.json` maps to a served Phoenix route
   (`RadasCliRouteParityTest` has no deferred entries).
2. ✅ No active references — `.github/`, `scripts/`, `ecosystem.config.cjs`,
   `AGENTS.md` point exclusively at `apps/server_elixir`.
3. ✅ Phoenix-only topology — router/nginx, docker-compose
   (`apps/server_elixir/docker-compose.yml`), pm2 and image builds
   (`build-images.yml` → opensible-phoenix) carry no Flask leg.
4. ✅ `git rm -r apps/server` done (including the `apps/server/IaC`
   submodule pointer); `tests/test_repo_paths.py` guards against
   reintroduction ("apps/server/" is a retired prefix) and its runner is
   now stdlib-only (`python3 tests/test_repo_paths.py`).

## What the cutover did

- **Phoenix is the API backend.** CI (`ci.yml` elixir-tests +
  `api-contract.yml`), docker-compose, pm2 (`ecosystem.config.cjs`), and the
  nginx router (`nginx/radas*.conf`) are wired to `apps/server_elixir`.
- **Flask `apps/server/` is retired in place** — deprecation banner on
  `app.py`, kept as a behavioral reference only. Guards in
  `tests/test_repo_paths.py` reject workflow targets and pm2 entries that
  still route to it.
- **Contract gates moved to ExUnit:**
  - CLI route parity: `RadasCliRouteParityTest` (contracts/cli-route-manifest.json
    vs `mix phx.routes`).
  - Ontology parity: `RadasOntologyParityTest` (contracts/domain-ontology.json
    vs the Executions state machine + alert-family backing).
  - Sensitive-path static rules: `scripts/check-sensitive-paths-elixir.sh`
    (SP001E/SP002E/SP003E; `# sensitive-path-ok` inline allowlist).
  - The OpenAPI byte-pin gate retired with Flask — clients are
    semantic-coupled; `contracts/radas-api-v2.openapi.json` is historical.
- **Cross-client gate:** `scripts/run-cross-client-contracts.sh` gate 1 now
  runs the Phoenix ExUnit suite as the behavioral reference.

## Remaining long-tail (the deferred ledger — each entry must be deleted in
## the commit that ports its service; mirrored in RadasCliRouteParityTest)

**Ported since the flip** (entries removed from the parity-test deferred
list): approvals (`RadasAI.ApprovalService` + ApprovalsController),
audit-log list/search/export/prune (`AuditLogController`), queue view
(`QueueController`), platform project list/create (`ProjectsController`),
ontology routes, admin workers, legacy `/api/cloud/*` aliases, drift
check/schedule.

**Still deferred** (each entry maps to `RadasCliRouteParityTest`'s
deferred list — remove there when ported):

| CLI path prefix | Flask source | Notes |
|---|---|---|
| `/api/compliance/report` | `api/compliance_routes.py` | UC evidence pack |
| `/api/tests`, `/api/test-cases/score` | `services/test_cases.py` (1061 LOC) | blocker-gate source for stack actions (fails closed in Flask) |
| `/api/registry`, `/api/registry/:id/install` | `api/code_registry_routes.py` | |
| `/api/users/invites` | user_service invites | |

Other Flask-only modules not CLI-consumed (sources, vault, global_secrets,
backups, bastion, preview, automation, branch-mapping, catalog, cicd-route
extras, env-promotion, billing, data routes…) follow the same rule: port on
demand when a client needs them, then delete the Flask source.

## Exit criteria for the final deletion of apps/server

1. The deferred ledger above is empty (parity test has no deferred entries).
2. `grep -r "apps/server/" .github scripts ecosystem.config.cjs AGENTS.md`
   returns no active references.
3. A release train has run with Phoenix-only traffic (router + compose).
4. Then: `git rm -r apps/server`, drop the `apps/server/IaC` submodule
   pointer, update `tests/test_repo_paths.py` (REQUIRED_APP_DIRS +
   RETIRED_PATH_PREFIXES: add "apps/server").
