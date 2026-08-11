# OpenSible Integration into the Radas Monorepo — Design Doc

**Date:** 2026-08-11
**Status:** Approved by user

## Context

- The radas monorepo (`~/Documents/go/github.com/raizora/radas`) was restored to its last committed state (commit `1f8986c`, main). It is a pnpm + Go monorepo: pnpm workspace globs `apps/*` and `packages/*`; `apps/cli/` is a Go CLI (module `github.com/raizora/radas/v4`); `apps/homepage/` is a Vite + React app; `modules/*` are TypeScript-only (not pnpm workspace members); `packages/*` are workspace members (`@radas/*`).
- The OpenSible project was missing from this machine and restored from GitHub (`opensible/opensible`) to `~/Documents/go/github.com/raizora/opensible`. Its structure:
  - `console/` — React 19 + Vite 6 + Tailwind 4 + TanStack web console (lockfile: `bun.lock`)
  - `server/` — Flask (Python) API: `app.py` at the package root, plus `api/`, `api_v2/`, `auth/`, `services/`, `storage/`, `templates/`, `schemas/`, `playbooks/`, `tests/`, `openapi/`, `utils/`, `scripts/`
  - `worker/` — Go worker (module `github.com/opensible/worker-go`, go 1.22): `cmd/`, `internal/`, `Dockerfile`
  - `IaC/` — OpenTofu modules (`opentofu-*`) and stack blueprints
  - Top-level: `docker-compose.yml`, `.env.example`, `.gitignore`, `.github/` (1 CI workflow + PR/issue templates), `README.md`, `CONTRIBUTING.md`, `GOVERNANCE.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE` (AGPL-3.0)

## Goal

Copy the full OpenSible codebase into the radas monorepo and integrate it following radas monorepo conventions, keeping the OpenSible repo at `…/raizora/opensible` untouched as an upstream.

## Decisions (user-approved)

1. **Split per component** — each OpenSible component maps to its own radas directory instead of a single vendored folder.
2. **Plain copy** — no git history transfer (no `git subtree`); future upstream syncs are manual.
3. **Copy everything** — including `.github/` and all organizational docs; nothing is excluded.
4. **Console is a separate product** — component source is not rewritten (no rebrand, no `@radas/*` package adoption). Only toolchain/workspace adaptation is allowed.
5. **No commit now** — all changes stay as working-tree changes; committing happens later per user instruction.

## File Mapping

| OpenSible source | Radas target | Notes |
|---|---|---|
| `console/*` | `apps/opensible-console/` | Flattened (contents of `console/` become the app root) |
| `server/*` | `apps/opensible-server/` | Flattened — mirrors the Docker image layout (`COPY server /app`, `CMD ["python", "app.py"]`) |
| `worker/*` | `apps/opensible-worker/` | `cmd/`, `internal/`, `go.mod`, `go.sum`, `Dockerfile` |
| `IaC/*` | `templates/opensible-iac/` | OpenTofu modules + blueprints |
| — | `apps/opensible-server/IaC` → `../../templates/opensible-iac` | **Symlink** (see IaC section) |
| `docker-compose.yml` | `apps/opensible-server/docker-compose.yml` | Deploy config for the server+console+worker stack |
| `.env.example` | `apps/opensible-server/.env.example` | |
| `LICENSE` (AGPL-3.0) | copied into **all 4 target dirs** | License must accompany copied code |
| `.github/` | `apps/opensible-server/.github/` | Copied verbatim; CI is dormant here (radas has its own root `.github/`) |
| `README.md`, `CONTRIBUTING.md`, `GOVERNANCE.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` | `apps/opensible-server/` | Copied verbatim; project-level docs travel with the platform app |
| `.gitignore` rules | merged into radas root `.gitignore` | Python/Go/data/secrets exclusions |

App names follow radas conventions where applicable:

- Console package name: `@radas/opensible-console`
- Server/worker have no package.json; they are standalone toolchains inside the monorepo (precedent: `apps/cli` is Go with no package.json).

## Console Adaptation (`apps/opensible-console/`)

The only source changes in the whole integration live here:

- `package.json` name: `opensible-web-frontend` → `@radas/opensible-console`.
- `typecheck` script: `tsgo --noEmit` → `tsc --noEmit` (`tsgo` is not listed in devDependencies; `typescript` is).
- Remove `bun.lock`. Dependencies are installed via the pnpm workspace (`apps/*` is already a glob member), producing `pnpm-lock.yaml` entries.
- Everything else — scripts (`dev` on :8080, `build`, `preview`), source, configs (Vite 6, Tailwind 4, React 19) — is preserved as-is.

## Server Adaptation (`apps/opensible-server/`)

- Flattening is safe: the server package already uses relative intra-package imports (`from .base import …`, `from .services …`); no `server.*` absolute imports exist.
- `BASE_DIR` resolves to the app dir (`apps/opensible-server/`), so `python app.py` runs from there; `DATA_DIR` defaults to `…/data` (overridable via env).

### IaC symlink

`server/services/cloud_provisioning.py` hardcodes `BASE_DIR / "IaC" / "opentofu-*"` for the provider modules. The Docker image satisfies this with `COPY IaC /app/IaC`. In the monorepo split, we satisfy it with a **symlink**:

```text
apps/opensible-server/IaC -> ../../templates/opensible-iac
```

- Serves local development without any code change.
- Caution: Docker `COPY` does not follow symlinks pointing outside the build context — image builds will need a follow-up change (swap the five `IAC_*_DIR = BASE_DIR / "IaC" / …` constants for an env-configurable base), deferred until image builds are actually needed.

## Worker Adaptation (`apps/opensible-worker/`)

- Go module path stays `github.com/opensible/worker-go` (module path is independent of directory location; renaming would require import rewrites for no functional gain).
- Build/run: `cd apps/opensible-worker && go build ./cmd/worker`.

## Monorepo Wiring

- `pnpm-workspace.yaml`: **unchanged** — `apps/*` already includes `apps/opensible-console` (has package.json); `apps/opensible-server` and `apps/opensible-worker` have no package.json so pnpm skips them automatically.
- Root `.gitignore`: add OpenSible-specific ignores — `__pycache__/`, `*.py[cod]`, `.venv/`, `venv/`, `.pytest_cache/`, `.coverage`, `data/`, `worker/bin/`, `**/worker.token`, `**/.encryption_key`, `ssh-keys/`, `console/dist/` (if not already covered).
- `AGENTS.md`: update the Layout section with the four new directories and add a "Run" note per app (console `pnpm dev`, server venv + `python app.py`, worker `go build ./cmd/worker`).
- The upstream repo at `…/raizora/opensible` stays untouched.

## Verification (success criteria)

1. `pnpm install` at radas root succeeds; `@radas/opensible-console` is a recognized workspace package.
2. `pnpm --filter @radas/opensible-console dev` serves a 200 page on :8080.
3. In `apps/opensible-server/`: create venv, `pip install -r requirements.txt`, then `python app.py` boots and listens on :5000 (compile + import check, at minimum).
4. `cd apps/opensible-worker && go build ./cmd/worker` produces a binary.
5. `git status` shows the new files as untracked additions (no commit yet).

## Deferred / Out of Scope

- Committing the integration (explicitly deferred by user).
- Building the OpenSible Docker images from this monorepo (build-context paths + IaC symlink caveat).
- Renaming the worker Go module path.
- Rebranding or adopting `@radas/*` packages in the console.
- Wiring OpenSible CI workflows into radas CI.

## Risks & Notes

- **License:** AGPL-3.0 text is copied alongside every component so the license travels with the code.
- **Lockfile divergence:** dropping `bun.lock` means the console's dependency graph is managed by pnpm from here on; upstream syncs must regenerate the lockfile.
- **Node/CI:** radas CI targets Node 20/pnpm 8; local verification runs Node 22. Console deps (Vite 6) support both; watch for CI drift.
- **`.github` dormancy:** OpenSible's copied `.github/` lives under `apps/opensible-server/.github/`, which GitHub does not execute — it is inert by design.