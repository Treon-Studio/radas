# RADAS Agent Notes

Concise instructions for agents working in this repo. Verified against the
`feat/console-v4-ai-router-clean` tree on 2026-08-28. Re-check after pulling —
the repo is in active transition and `main` is behind this branch.

## Repo state (read first)

- **Real app tree:** `apps/` = `cli`, `console`, `desktop-app`, `server`,
  `worker` (+ a `data/` runtime dir). There is **no** `apps/dashboard`,
  `apps/extension`, `apps/site`, `apps/homepage`, or `apps/opensible-*`.
  The Chrome extension was removed (commit `4feaf59d`); `MIGRATION_GUIDE.md`
  is retired in place with a banner.
- **The server is `apps/server/`** (Flask, Python 3.14 venv). Older docs,
  plans, and commit messages may say `apps/opensible-server` — that path is
  retired; `tests/test_repo_paths.py` fails any file that reintroduces it.
  `apps/server/apps/opensible-server/` is a nested legacy data dir, not code.
- **No `modules/` directory.** Shared TypeScript lives in `packages/`.
- **Contract artifacts are authoritative:** `contracts/radas-api-v2.openapi.json`
  (served snapshot, byte-pinned by a test), `contracts/cli-route-manifest.json`
  (route parity gate), `contracts/cross-client-fixtures.json` (Go/TS parity),
  `contracts/radas-api-v2-violations-baseline.json` (tighten-only ratchet).
- **Domain ontology:** `contracts/domain-ontology.json` is authoritative for
  entity states/transitions/alert semantics; parity-gated by
  `apps/server/tests/test_ontology_parity.py` (see
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
  server/       Flask control plane (Python 3.14). One-time setup:
                cd apps/server && python3 -m venv .venv &&
                .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
                Tests: .venv/bin/pytest (TEST_DATABASE_URL, see Database).
  worker/       Go worker (module github.com/opensible/worker-go, go >= 1.22).
                Run: go build -o bin/worker ./cmd/worker.
  data/         Runtime data directory (not code).
packages/       pnpm workspace members:
                config, hooks, sdk, types, ui, utils, validation
templates/      docs/ + opensible-iac/ (OpenTofu/Ansible tree used by the
                server; the server may rewrite platform-owned `_template/`
                files on boot — `git checkout -- <path>` those before commit).
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
- **Server (Python):** from `apps/server`: `compileall` for syntax, then
  `TEST_DATABASE_URL=sqlite:///:memory:` (plus the CI-style
  JWT/INTERNAL_CALL/GLOBAL_SECRETS env; mirror
  `.github/workflows/api-contract.yml`) `.venv/bin/pytest -q`.
  Do **not** run two pytest processes concurrently — they reset each other's
  test schema and produce spurious ERRORs.
- **Worker (Go):** `cd apps/worker && go test ./...`.
- **Console:** `cd apps/console && pnpm typecheck && pnpm test && pnpm build`.
- **Cross-client contract gate:** `bash scripts/run-cross-client-contracts.sh`
  (mode a offline; `RUN_FULL_CONTRACT=1` + `RADAS_TEST_*` for live-server
  legs). Runs in CI as the `cross-client-contracts` job.
- **Repo layout integrity:** `pytest tests/test_repo_paths.py`.
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

- `api-contract.yml` — server contract gate on `apps/server/**`,
  `contracts/**` changes: postgres:16 service, full server suite, OpenAPI
  snapshot byte-compare, redaction + sensitive-path checks, spec-diff artifact.
- `ci.yml` — server sensitive-path static rules + `cross-client-contracts`
  job (`scripts/run-cross-client-contracts.sh` mode a: server pytest
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
  byte-pinned — regenerate only via `apps/server/scripts/export_openapi.py`
  and update the baseline ratchet deliberately.
- **Secrets are never logged or embedded in assertion messages**; test
  headers derive from the runtime env (see
  `tests/test_global_secret_key_routes.py` for the pattern).

## Things that will trip you up

- Don't reference `apps/opensible-server`, `apps/radas-console`,
  `apps/chrome-ext`, or `apps/extension` — they are retired and guarded by
  `tests/test_repo_paths.py`.
- Don't import `app.py` from server tests to get singletons; it starts
  background schedulers at import. Use the blueprint-registering harness in
  `apps/server/tests/test_cli_server_integration.py` /
  `test_e2e_flow_matrix.py` (and `app_context.set_projects_dir`).
- Console `pnpm test` includes env-gated real-HTTP legs that skip unless
  `VITEST_CROSS_CLIENT_*` is set; Go integration tests skip unless
  `RADAS_TEST_*` is set. Set them only for live-server verification.
- Local Go must be ≥ 1.25 (CLI `go.mod` uses go 1.25.0).

## Database

- **Selalu PostgreSQL.** `DATABASE_URL` wajib; skema di-manage
  `apps/server/storage/pg_schema.py` (versioned `schema_migrations`); jangan
  buat tabel manual di luar itu.
- Akses via `storage/pg.py` helpers (`execute/query_one/query_all/
  transaction`) atau `storage/pg_compat.py` (facade sqlite3-style).
- JSON-config stores → tabel `kv_store(scope, key, value jsonb)`; gunakan
  `storage/kv.py`. Durable failure counters also live there
  (`storage/metrics_counters.py`).
- Test memakai `TEST_DATABASE_URL` (default `postgresql://localhost/radas_test`;
  CI memakai `sqlite:///:memory:`); schema di-reset per test via fixture
  `pg_db`.
- Multi-tenant: `orgs`/`org_members`, `projects.org_id`; JWT membawa
  `org_id`; route project-scoped memakai `require_project_access`.
- Lihat `docs/postgres-neon.md`.
