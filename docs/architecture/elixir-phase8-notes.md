# Elixir Migration — Phase 8 Ledger (Flask Decommission)

Status per 2026-09-04, branch `feat/elixir-migration-phase0`.

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

| CLI path prefix | Flask source | Notes |
|---|---|---|
| `/api/approvals` | `services/approval_service.py` (447 LOC) | approve/reject/list + should_skip_approval gate (also used by the stack-action approval gate) |
| `/api/audit-log`, `/api/audit/search`, `/api/audit-log/export` | `api/audit_log_routes.py` | audit_log table already shared |
| `/api/compliance/report` | `api/compliance_routes.py` | UC evidence pack |
| `/api/tests`, `/api/test-cases/score` | `services/test_cases.py` (1061 LOC) | blocker-gate source for stack actions (fails closed in Flask) |
| `/api/registry`, `/api/registry/:id/install` | `api/code_registry_routes.py` | |
| `/api/queue` | `api/queue_search_routes.py` (489 LOC) | queue stats/search/capabilities |
| `/api/projects` | `api/projects_routes.py` (487 LOC) | platform-envelope project list/services |
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
