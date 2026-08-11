# RADAS Agent Notes

Concise instructions for agents working in this repo. Verified against current
state on `main`. Re-check after pulling — the repo is in active transition.

## Repo state (read first)

- **Tracked on `main`:** the `radas` Go CLI at `apps/cli/`. Everything else is
  in-progress work that may not be committed.
- **Uncommitted on this checkout (per `git status`):** `apps/dashboard/`,
  `apps/extension/`, `apps/site/`, `packages/dev-tools/`, `.opencode/`,
  `graphify-out/`. Don't assume these match `main` on other clones.
- **Renamed (stale references in CI/scripts/docs):** `apps/chrome-ext` was
  renamed to `apps/extension`. The GitHub workflows
  `.github/workflows/chrome-ext-build.yml`,
  `chrome-ext-release.yml`, plus `scripts/migrate-imports.sh`,
  `MIGRATION_GUIDE.md`, and `FIX_BUILD.md` still reference the old name. They
  will not work as-is — fix paths before relying on them.
- **Monorepo declared path vs actual workspace:** `pnpm-workspace.yaml` only
  globs `apps/*` and `packages/*` (NOT `modules/*`). `modules/*` is reachable
  only via TypeScript `paths` in `tsconfig.base.json` — there is no
  `pnpm --filter @radas/module-*` resolution.
- **Stale tsconfig path:** `tsconfig.base.json` aliases `@radas/module-projects`,
  `@radas/module-users`, `@radas/module-wiki`, and `@radas/api-client`, but
  those directories do not exist. Imports using them will fail.
- **`ARCHITECTURE.md` and `MIGRATION_GUIDE.md` are aspirational and partially
  out of date.** Trust executable config (`tsconfig.base.json`,
  `pnpm-workspace.yaml`, each `package.json`) over those docs.

## Knowledge graph (graphify)

- Graph is at `graphify-out/` (committed in some branches, see `git status`).
- `graphify-out/GRAPH_REPORT.md` is the map: god nodes, communities, edges.
- Read it before grep/glob/searching the codebase or answering
  "how does X relate to Y" questions. The `.opencode/plugins/graphify.js`
  plugin already injects a one-time reminder before the first `bash` call.
- After modifying code, refresh with `graphify update .` (AST-only, no API
  cost). Verify freshness: graph header lists the source commit.

## Layout

```
apps/
  cli/         Radas CLI (Go, module radas, go 1.25). The tracked core.
  dashboard/   Next.js template. Not wired to @radas/* packages.
  extension/   Chrome extension (tsup). Depends on packages/dev-tools.
  homepage/    Vite + React 18 landing page.
  radas-console/  @radas/console (Vite + React 19 console, from OpenSible).
                        Run: pnpm --filter @radas/console dev (port 8080).
  opensible-server/   Flask API (Python 3.14). Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python app.py (port 5000). Depends on IaC via symlink IaC -> ../../templates/opensible-iac.
  opensible-worker/   Go worker (module github.com/opensible/worker-go, go >= 1.22). Run: go build -o bin/worker ./cmd/worker.
  site/        Vite + React 19 site. Depends on packages/dev-tools.
modules/       TypeScript-only via tsconfig paths. NOT a pnpm workspace.
  attendance, auth, chat, company-info, drive, hiring, links,
  notifications, okr, profile
packages/      pnpm workspace members.
  config, hooks, types, ui, utils, validation, dev-tools
templates/     Only `docs/` and README.md are checked in; rest are external
               degit targets. `opensible-iac/` is the imported OpenSible
               OpenTofu/Ansible tree (see apps/opensible-server IaC symlink).
               NOTE: the Flask server rewrites platform-owned `_template/`
               files (e.g. `opentofu-bytedc/envs/_template/backend.tf`) to its
               own canonical form on boot — git diffs on those files after a
               server run are expected; `git checkout -- <path>` before commit.
```

## Roadmap

- Product backlog & prioritas: `docs/ROADMAP.md` (100 use case, P0–P2,
  status ✅/🔶/⬜, pemetaan fase).
- Implementation plans per fase: `docs/superpowers/plans/2026-08-11-phase{1..5}-*.md`.
- Fase 1 (ops quick wins) adalah yang paling detail & siap dieksekusi.
- Saat mulai fase baru: expand plan fase menjadi task executable (konvensi
  `docs/superpowers/plans/`) dan tandai status di ROADMAP saat selesai.

## Build & test commands

**Root has no `scripts` block** (root `package.json` has only
`firebase-tools` as a devDep). Run commands inside the package you care
about, or use `pnpm -r --filter <name> ...`.

- **CLI (Go):**
  - `cd apps/cli && go build -o bin/radas` — current platform.
  - `cd apps/cli && make build` or `make build-all` — wraps `scripts/build.sh`
    for cross-compile. Binaries land in `apps/cli/bin/`.
  - `cd apps/cli && go test ./...` — unit tests (target ~96% coverage on core).
  - `govulncheck ./...` from `apps/cli/` — Go vulnerability scan.
  - `go run github.com/radas/radas/v3@latest create` — CLI's own quick start.
- **Web apps (extension/site/dashboard/homepage):** each has its own
  `dev` / `build` script. Run from inside the app dir.
- **Radas stack (local dev via pm2):** server (Flask :5001) + console
  (:8080, proxies `/api` → server) + worker (Go). One-time setup:
  `cd apps/opensible-server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`.
  Then `pnpm dev:radas` (start), `pnpm dev:radas:stop` / `:restart` /
  `:logs` (see `ecosystem.config.cjs`). First login: admin /
  `ADMIN_INITIAL_PASSWORD` from the ecosystem env (dev-only).
- **macOS note:** port 5000 is occupied by AirPlay Receiver, so the server
  runs on 5001 by default (`PORT` env). To free 5000: System Settings →
  General → AirDrop & Handoff → disable AirPlay Receiver, then
  `OPEN_SERVER_PORT=5000 pm2 start ecosystem.config.cjs`.
- **Workspace packages:** each has a `type-check` script (`tsc --noEmit`).
- **Security overrides:** root `package.json` → `pnpm.overrides` pins patched
  versions of vulnerable transitive deps (mostly via firebase-tools and
  @tanstack/react-start). `pnpm audit` should stay at 0 critical / 0 high.
  When bumping deps, don't silently drop these entries; extend them instead.
- **Whole repo:** `./scripts/vulnerability-scan.sh` (Go + `pnpm audit --prod
  --audit-level high`). Run before pushing; requires `govulncheck` and `pnpm`.

## Toolchain quirks

- **Node 20, pnpm 8** (per CI workflows). Don't bump pnpm without checking
  the lockfile.
- **`.npmrc`:** `shamefully-hoist=true`, `link-workspace-packages=false`,
  `prefer-workspace-packages=false`. Some tools that expect hoisted deps
  need explicit installs.
- **`degit.json`:** when this repo is used as a scaffold template, it strips
  `apps/`, `packages/`, `templates/`, `pnpm-lock.yaml`, `README.md`, etc.
  Treat the tracked tree as a template, not a runtime app bundle.
- **`.ncurc.json`:** `ncu` at root only scans `apps/**` and `packages/**`
  (not `modules/**`). Run it from inside a module to update its deps.
- **Biome** is the formatter/linter (see `biome.json`). Style: 4-space JSON,
  2-space JS/TS, single quotes, no semis (`asNeeded`), 100-col, sorted
  tailwind classes via `cn`/`clx`/`clsx`/`cva`/`tw`.
- **Moonrepo** (`.moon/`) is configured but commented out — no live
  toolchain. Ignore unless reactivating.
- **OpenCode plugin** `.opencode/plugins/graphify.js` injects the graph
  reminder. No further config required.

## CI workflows (`.github/workflows/`)

- `chrome-ext-build.yml` — Build & test on `apps/chrome-ext/**` changes.
  **Stale path; never triggers** (the app is at `apps/extension`).
- `chrome-ext-release.yml` — Tag-triggered (`chrome-ext-v*.*.*`) or manual
  dispatch. Pulls secrets from Infisical (`INFISICAL_TOKEN_CHROME_EXT_*`).
  Also references the stale `apps/chrome-ext` path.
- `discord-pr-notification.yml` — Posts to a hardcoded Discord webhook on PR
  open/reopen. Webhook URL is in-repo (visible).
- `push-notification.yml` — Posts to Discord on push to **`develop` branch
  only** (not `main`). The "RADAS Development Update" embed lists changed
  apps under `apps/`.
- No root-level lint, typecheck, or test CI exists. Only the chrome-ext
  build runs `pnpm compile` + `pnpm build` per-package.

## Conventions

- **Dependency flow:** `apps → modules → packages`. `packages` must not
  import from `modules`. `modules` should not import each other — push
  shared code into `packages/`.
- **Module/package naming:** `@radas/<name>` for packages,
  `@radas/module-<name>` for modules. CLI Go module is just `radas`.
- **Adding a new module:** `mkdir -p modules/<name>/{client,shared}`, create
  `package.json` with `name: "@radas/module-<name>"`, `main: "./client/index.ts"`,
  add a `tsconfig.json`, add a `paths` entry in `tsconfig.base.json`. There
  is no generator.
- **Import path examples (working):** `@radas/ui`, `@radas/utils`,
  `@radas/module-auth`, `@radas/module-links`.
- **Imports that currently break:** anything under `@radas/api-client`,
  `@radas/module-projects`, `@radas/module-users`, `@radas/module-wiki`.

## Things that will trip you up

- Don't run `pnpm -r type-check` from root expecting it to cascade — only
  some packages define a `type-check` script, and the root has none.
- Don't trust `ARCHITECTURE.md` for current directory lists. The real
  inventory: 6 apps, 7 packages, 10 modules (not the 13 listed there).
- `apps/extension` builds with `tsup` (not Vite/WXT). The CI workflow
  expects a WXT-style build at `apps/chrome-ext/.output/chrome-mv3` —
  both are wrong for the current code.
- The CLI's own `go.mod` is module `radas` (not `github.com/.../cli`), and
  uses `go 1.25.0`. Local Go must be ≥ 1.25.
- Secrets for the chrome-ext come from Infisical, not from `.env`. Locally
  you can copy `.env.example` to `.env`; CI uses dummy values when the
  token is absent.
