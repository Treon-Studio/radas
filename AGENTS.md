# RADAS Agent Notes

Concise instructions for agents working in this repo. Updated for the
Phase 8 Elixir cutover on 2026-09-04 (`feat/elixir-migration-phase0`).
Re-check after pulling — the repo is in active transition.

## Repo state (read first)

- **Real app tree:** `apps/` = `cli`, `console`, `desktop-app`,
  `server`, `worker` (+ a `data/` runtime dir). There is **no**
  `apps/dashboard`, `apps/extension`, `apps/site`, `apps/homepage`, or
  `apps/opensible-*`. The Chrome extension was removed (commit `4feaf59d`);
  `MIGRATION_GUIDE.md` is retired in place with a banner.
- **The API backend is `apps/server/` (Phoenix/Elixir).** The Elixir
  migration is COMPLETE: Phase 8 flipped CI, docker-compose, pm2 and the
  nginx router to Phoenix and **physically removed the Flask tree
  `apps/server/`**. Every remote CLI command in
  `contracts/cli-route-manifest.json` maps to a served Phoenix route
  (`RadasCliRouteParityTest`). Older docs may say `apps/opensible-server`
  or `apps/server` — both retired; `tests/test_repo_paths.py` rejects
  reintroductions.
- **No `modules/` directory.** Shared TypeScript lives in `packages/`.
- **Contract artifacts are authoritative:** `contracts/radas-api-v2.openapi.json`
  (historical served snapshot — the byte-pin gate retired with Flask;
  clients are semantic-coupled, not byte-coupled),
  `contracts/cli-route-manifest.json` (CLI route-parity gate, now
  enforced by `RadasCliRouteParityTest` against the Phoenix routes),
  `contracts/cross-client-fixtures.json` (Go/TS parity),
  `contracts/radas-api-v2-violations-baseline.json` (tighten-only ratchet).
- **Domain ontology:** `contracts/domain-ontology.json` is authoritative for
  entity states/transitions/alert semantics; parity-gated by
  `RadasOntologyParityTest` in apps/server (see
  `docs/architecture/domain-ontology.md`).
- **Evidence & verification docs:** `docs/architecture/roadmap-evidence-matrix.md`,
  `docs/architecture/e2e-flow-matrix.md`, `docs/verification/`. Trust these
  over `ARCHITECTURE.md`.

## Knowledge graph (graphify)

- Graph is at `graphify-out/` (committed in some branches, see `git status`).
- `graphify-out/GRAPH_REPORT.md` is the map: god nodes, communities, edges.
- Read it before grep/glob/searching the codebase or answering
  "how does X relate to Y" questions.
- After modifying code, refresh with `graphify update .` (AST-only, no API
  cost). Verify freshness: graph header lists the source commit.

## Layout

```
apps/
  cli/          Radas CLI (Go, module github.com/raizora/radas/v4, go 1.25).
  console/      @radas/console (Vite + React 19 console; vitest + jsdom).
                Run: pnpm --filter @radas/console dev (port 8080).
  desktop-app/  @radas/desktop-app.
  server/         Phoenix control plane (the API backend). Setup:
                cd apps/server && mix deps.get && mix ecto.setup
                Run: mix phx.server (port 4000).
  worker/       Go worker (module github.com/opensible/worker-go, go >= 1.22).
                Run: go build -o bin/worker ./cmd/worker.
  data/         Runtime data directory (not code).
packages/       pnpm workspace members:
                config, hooks, sdk, types, ui, utils, validation
templates/      docs/ + opensible-iac/ (OpenTofu/Ansible tree — the tracked
                IaC source the Phoenix server syncs into stack workspaces;
                the server may rewrite platform-owned `_template/`
                files — `git checkout -- <path>` those before commit).
contracts/      API contract artifacts + fixtures (see Repo state).
scripts/        Repo-level driver scripts (cross-client contracts, layout
                verification, vulnerability scan, import migration).
tests/          Repo-level path-integrity tests (stdlib pytest).
```

## Roadmap

- Product backlog & prioritas: `docs/ROADMAP.md` (use case rows with P0–P2
  priority and ✅/🔶/⬜ status). The former "100% complete" summary was
  replaced by `docs/architecture/roadmap-evidence-matrix.md` — a row counts
  as ✅ only with evidence recorded there.
- Implementation plans: `docs/superpowers/plans/` (one file per plan, each
  with a verification matrix). Progress ledgers under `.superpowers/sdd/`.

## Build & test commands

- **CLI (Go):** `cd apps/cli && go build -o bin/radas`; `go test ./...`;
  `govulncheck ./...`. Module is `github.com/raizora/radas/v4`.
- **Server (Elixir/Phoenix):** from `apps/server`: `mix deps.get`,
  then `mix test` (needs DATABASE_URL/TEST_DATABASE_URL + JWT/INTERNAL_CALL/
  GLOBAL_SECRETS env; mirror `.github/workflows/api-contract.yml`).
  The gates: full `mix test` (includes RadasCliRouteParityTest +
  RadasOntologyParityTest), `bash scripts/check-server-contract.sh` (smoke
  against a running server), `pytest tests/test_repo_paths.py` (repo guards),
  `bash scripts/check-sensitive-paths.sh`.
- **Repo layout integrity:** `python3 tests/test_repo_paths.py` (stdlib,
  no venv needed; also runs under pytest).
- **Worker (Go):** `cd apps/worker && go test ./...`.
- **Console:** `cd apps/console && pnpm typecheck && pnpm test && pnpm build`.
- **Cross-client contract gate:** `bash scripts/run-cross-client-contracts.sh`
  (mode a offline; `RUN_FULL_CONTRACT=1` + `RADAS_TEST_*` for live-server
  legs). Runs in CI as the `cross-client-contracts` job.

- **Radas stack (local dev via pm2):** `pnpm dev:radas` / `:stop` / `:restart`
  (see `ecosystem.config.cjs`). macOS note: port 5000 is AirPlay; the server
  defaults to 5001.

## Toolchain quirks

- **Node 22, pnpm 9+** (CI uses Node 22; local pnpm 11.24 works). Don't bump
  pnpm without checking the lockfile.
- **`.npmrc`:** `shamefully-hoist=true`, `link-workspace-packages=false`,
  `prefer-workspace-packages=false`.
- **`degit.json`:** when this repo is used as a scaffold template, it strips
  `apps/`, `packages/`, `templates/`, `pnpm-lock.yaml`, `README.md`, etc.
- **Biome** is the formatter/linter (see `biome.json`). Style: 4-space JSON,
  2-space JS/TS, single quotes, no semis (`asNeeded`), 100-col.
- **`.zcode/plans/`** holds session plan artifacts; `.opencode/` is gone.

## CI workflows (`.github/workflows/`)

- `api-contract.yml` — Phoenix contract gate on `apps/server/**`,
  `contracts/**` changes: postgres:16 service, full `mix test` suite
  (includes the CLI route-parity + ontology parity gates), sensitive-path
  static rules for the Elixir tree.
- `ci.yml` — server sensitive-path static rules + `cross-client-contracts`
  job (`scripts/run-cross-client-contracts.sh` mode a: Phoenix ExUnit
  reference + console typecheck/vitest/build + CLI/worker Go tests).
- `deploy-console.yml` — deploys `apps/console` to Cloudflare Pages
  (`--project-name radas-console`).
- `deploy-vps.yml`, `desktop-release.yml` — deployment/release flows.

## Conventions

- **Dependency flow:** `apps → packages`. `packages` must not import from
  apps. Repository-local workspace package naming is `@radas/<name>`.
- **Shared package ownership:** [`Treon-Studio/infra`](https://github.com/Treon-Studio/infra)
  is the canonical source for cross-repository infrastructure packages such as
  `@treon-studio/contracts`, `validation`, `config`, `observability`,
  `api-client`, `biome-config`, and `tsconfig`, distributed through GitHub
  Packages. Change their source in `infra`, publish a version, and upgrade it
  here; do not copy, fork, or recreate them locally. Product SDKs remain in
  their producing repositories: `@treon-studio/radas-sdk` is owned here, while
  `@treon-studio/kurir-sdk` is owned by Kurir. Do not confuse the published
  `@treon-studio/*` scope with the legacy/local `@treonstudio/*` scope.
- **Go modules:** CLI `github.com/raizora/radas/v4`; worker
  `github.com/opensible/worker-go`.
- **Platform contracts:** `/api/v2/*` always returns the platform envelope
  (`{data, request_id}` / `{error:{code,message,details}}`); legacy `/api/*`
  routes keep their historical shapes. The served OpenAPI snapshot is
  served by Phoenix; the historical byte-pin gate retired with Flask.
  `contracts/cli-route-manifest.json` is the enforced route contract —
  every remote CLI command must resolve to a Phoenix route.
- **Secrets are never logged or embedded in assertion messages**; test
  headers derive from the runtime env (see
  `tests/test_global_secret_key_routes.py` for the pattern).

## Things that will trip you up

- Don't reference `apps/opensible-server`, `apps/radas-console`,
  `apps/chrome-ext`, or `apps/extension` — they are retired and guarded by
  `tests/test_repo_paths.py`.
- Don't import `app.py` from server tests to get singletons; it starts
  background schedulers at import. Use the blueprint-registering harness in
  the Phoenix ExUnit harnesses in `apps/server/test/` (DataCase
  seeds orgs/projects/memberships directly; do not import a server
  bootstrap module).
- Console `pnpm test` includes env-gated real-HTTP legs that skip unless
  `VITEST_CROSS_CLIENT_*` is set; Go integration tests skip unless
  `RADAS_TEST_*` is set. Set them only for live-server verification.
- Local Go must be ≥ 1.25 (CLI `go.mod` uses go 1.25.0).

## Database

- **Selalu PostgreSQL.** `DATABASE_URL` wajib; skema di-manage oleh Ecto
  migration di `apps/server/priv/repo/migrations/` (tracking table
  `ecto_migrations`) + historical Python `schema_migrations` rows; jangan
  buat tabel manual di luar itu.
- Akses via `RadasAI.DB` helpers (`query_one!/query_all!/execute!`) dan
  `Radas.Repo` (Ecto) di apps/server; JSONB needs explicit
  `$n::jsonb`/`::text::jsonb` casts in raw SQL.
- JSON-config stores → tabel `kv_store(scope, key, value jsonb)`; gunakan
  `storage/kv.py`. Durable failure counters also live there
  (`storage/metrics_counters.py`).
- Test memakai `TEST_DATABASE_URL` (default `postgresql://localhost/radas_test`;
  CI memakai `sqlite:///:memory:`); schema di-reset per test via fixture
  `pg_db`.
- Multi-tenant: `orgs`/`org_members`, `projects.org_id`; JWT membawa
  `org_id`; route project-scoped memakai `require_project_access`.
- Lihat `docs/postgres-neon.md`.
