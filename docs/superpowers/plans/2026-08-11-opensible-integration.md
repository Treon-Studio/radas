# OpenSible Integration into the Radas Monorepo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copy the full OpenSible codebase into the radas monorepo, split per component (`apps/opensible-console|server|worker`, `templates/opensible-iac`), and wire it into the monorepo conventions.

**Architecture:** Plain file copy (no git history) from the upstream repo `~/Documents/go/github.com/raizora/opensible` (read-only source) into the radas monorepo. The console joins the pnpm workspace with a renamed package (`@radas/opensible-console`); server (Flask/Python) and worker (Go) stay standalone toolchains; IaC lives in `templates/opensible-iac/` and is linked to the server via symlink (server hardcodes `BASE_DIR / "IaC" / …`).

**Tech Stack:** pnpm 10 (workspace, lockfile v9), Node 22, Vite 6 + React 19 + Tailwind 4 (console), Flask/Python 3.14 (server), Go 1.25 (worker, needs ≥1.22), shell (macOS).

## Global Constraints

- **NO git commits in any task.** All changes remain working-tree changes; committing happens later per explicit user decision. Every task's final step is a verification, never a commit.
- Do **not** modify the upstream repo `~/Documents/go/github.com/raizora/opensible` — it is read-only input.
- Preserve the AGPL-3.0 `LICENSE` inside **every** copied component dir (console, server, worker, `templates/opensible-iac/`).
- Source changes are limited to two edits in `apps/opensible-console/package.json` (name, typecheck script). Everything else is copied byte-for-byte.
- radas root `.gitignore` already ignores `go.sum*` — the copied `apps/opensible-worker/go.sum` will be untracked. That matches radas convention (same as `apps/cli`); do not fight it.
- radas root `.gitignore` already covers `node_modules`, `.env`, `.env.*` (+`!.env.example`), `dist/`, `build/`, `.astro/` — the copied console/server files matching those patterns need no new rules.
- Radas conventions: `apps/*` is already a pnpm workspace glob; console (has `package.json`) becomes a member automatically; server/worker (no `package.json`) are skipped by pnpm automatically.
- All source paths below use `RADAS` = `/Users/ridho/Documents/go/github.com/raizora/radas` and `OPEN` = `/Users/ridho/Documents/go/github.com/raizora/opensible`.

---

### Task 1: Copy console into `apps/opensible-console/`

**Files:**
- Create: `apps/opensible-console/**` (copy of `OPEN/console/**`)
- Create: `apps/opensible-console/LICENSE`
- Modify: `apps/opensible-console/package.json` (2 lines)
- Delete: `apps/opensible-console/bun.lock`

**Interfaces:**
- Consumes: nothing (source = upstream `console/`).
- Produces: workspace package `@radas/opensible-console` consumed by Task 6 (`pnpm --filter @radas/opensible-console dev`).

- [ ] **Step 1: Copy the console directory**

```bash
mkdir -p "$RADAS/apps"
cp -R "$OPEN/console" "$RADAS/apps/opensible-console"
```

- [ ] **Step 2: Copy the AGPL license into the app dir**

```bash
cp "$OPEN/LICENSE" "$RADAS/apps/opensible-console/LICENSE"
```

- [ ] **Step 3: Rename the package and fix the typecheck script**

In `$RADAS/apps/opensible-console/package.json`, change exactly:

```diff
-  "name": "opensible-web-frontend",
+  "name": "@radas/opensible-console",
```

and

```diff
-    "typecheck": "tsgo --noEmit",
+    "typecheck": "tsc --noEmit",
```

(`tsgo` is not in devDependencies; `typescript` is. All other scripts stay as-is.)

- [ ] **Step 4: Remove the bun lockfile**

```bash
rm "$RADAS/apps/opensible-console/bun.lock"
```

- [ ] **Step 5: Verify**

```bash
cd "$RADAS" && ls apps/opensible-console | head && \
  grep '"name"' apps/opensible-console/package.json && \
  test ! -f apps/opensible-console/bun.lock && echo "bun.lock removed OK" && \
  test -f apps/opensible-console/LICENSE && echo "LICENSE present"
```

Expected: `package.json`, `src`, `vite.config.ts`, `index.html`, `tsconfig.json`, `Dockerfile`, … ; name shows `"@radas/opensible-console"`; `bun.lock removed OK`; `LICENSE present`. No commit (Constraint 1).

---

### Task 2: Copy IaC into `templates/opensible-iac/`

**Files:**
- Create: `templates/opensible-iac/**` (copy of `OPEN/IaC/**`)
- Create: `templates/opensible-iac/LICENSE`

**Interfaces:**
- Produces: `templates/opensible-iac/` — the symlink target for `apps/opensible-server/IaC` (Task 3) and the dir consumed by Task 7's server boot.

- [ ] **Step 1: Copy the IaC tree**

```bash
mkdir -p "$RADAS/templates"
cp -R "$OPEN/IaC" "$RADAS/templates/opensible-iac"
```

- [ ] **Step 2: Copy the AGPL license**

```bash
cp "$OPEN/LICENSE" "$RADAS/templates/opensible-iac/LICENSE"
```

- [ ] **Step 3: Verify**

```bash
cd "$RADAS" && ls templates/opensible-iac && \
  test -d templates/opensible-iac/opentofu-bytedc && echo "tofu modules OK" && \
  test -d templates/opensible-iac/blueprints && echo "blueprints OK" && \
  test -f templates/opensible-iac/LICENSE && echo "LICENSE present"
```

Expected: `blueprints` + `opentofu-*` dirs; `tofu modules OK`; `blueprints OK`; `LICENSE present`. No commit.

---

### Task 3: Copy server into `apps/opensible-server/` + IaC symlink

**Files:**
- Create: `apps/opensible-server/**` (copy of `OPEN/server/**`)
- Create: `apps/opensible-server/LICENSE`, `docker-compose.yml`, `.env.example`
- Create: `apps/opensible-server/README.md`, `CONTRIBUTING.md`, `GOVERNANCE.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
- Create: `apps/opensible-server/.github/**` (copy of `OPEN/.github/**`)
- Create: symlink `apps/opensible-server/IaC -> ../../templates/opensible-iac`

**Interfaces:**
- Consumes: `templates/opensible-iac` (Task 2) as symlink target.
- Produces: `apps/opensible-server/` (Flask app root `app.py`) consumed by Task 7.

- [ ] **Step 1: Copy the server directory**

```bash
cp -R "$OPEN/server" "$RADAS/apps/opensible-server"
```

- [ ] **Step 2: Copy project-level files (everything, per user decision)**

```bash
cd "$OPEN" && cp LICENSE docker-compose.yml .env.example README.md CONTRIBUTING.md GOVERNANCE.md SECURITY.md CODE_OF_CONDUCT.md "$RADAS/apps/opensible-server/" && cp -R .github "$RADAS/apps/opensible-server/.github"
```

- [ ] **Step 3: Create the IaC symlink**

```bash
ln -s ../../templates/opensible-iac "$RADAS/apps/opensible-server/IaC"
```

The link is relative to `apps/opensible-server/` and resolves to the task-2 target. Do not use an absolute link.

- [ ] **Step 4: Verify**

```bash
cd "$RADAS" && ls apps/opensible-server | head && \
  test -f apps/opensible-server/app.py && echo "app.py OK" && \
  test -L apps/opensible-server/IaC && test -e apps/opensible-server/IaC && echo "IaC symlink resolves" && \
  test -f apps/opensible-server/.github/workflows/ci.yml && echo ".github copied" && \
  test -f apps/opensible-server/LICENSE && echo "LICENSE present"
```

Expected: `app.py` + `api`, `api_v2`, `services`, `auth`, …; `app.py OK`; `IaC symlink resolves` (target exists from Task 2); `.github copied`; `LICENSE present`. No commit.

---

### Task 4: Copy worker into `apps/opensible-worker/`

**Files:**
- Create: `apps/opensible-worker/**` (copy of `OPEN/worker/**`)
- Create: `apps/opensible-worker/LICENSE`

**Interfaces:**
- Produces: standalone Go module `github.com/opensible/worker-go` at `apps/opensible-worker/` (module path intentionally unchanged).

- [ ] **Step 1: Copy the worker directory**

```bash
cp -R "$OPEN/worker" "$RADAS/apps/opensible-worker"
```

- [ ] **Step 2: Copy the AGPL license**

```bash
cp "$OPEN/LICENSE" "$RADAS/apps/opensible-worker/LICENSE"
```

- [ ] **Step 3: Build it (verification)**

```bash
cd "$RADAS/apps/opensible-worker" && go build -o /tmp/opensible-worker-smoke ./cmd/worker
```

Expected: command exits 0 (downloads `gopkg.in/yaml.v3` on first run). Note: `apps/opensible-worker/go.sum` stays untracked (radas root ignores `go.sum*`) — expected, not an error.

- [ ] **Step 4: Confirm the binary and clean up**

```bash
test -x /tmp/opensible-worker-smoke && echo "worker build OK" && rm /tmp/opensible-worker-smoke
```

Expected: `worker build OK`. No commit.

---

### Task 5: Wire monorepo (.gitignore, AGENTS.md)

**Files:**
- Modify: `.gitignore` (append section)
- Modify: `AGENTS.md` (Layout + build/run notes)

**Interfaces:**
- Consumes: paths introduced by Tasks 1–4.
- Produces: repository-wide ignore rules + agent docs used by Task 6/7 verification and future work.

- [ ] **Step 1: Append the OpenSible section to root `.gitignore`**

Append this block to the end of `$RADAS/.gitignore` (after the `# Specific directories for individual projects` line):

```gitignore

# OpenSible (apps/opensible-*)
__pycache__/
*.py[cod]
.venv/
venv/
.pytest_cache/
.coverage
htmlcov/
.mypy_cache/
data/
ssh-keys/
**/worker.token
**/.encryption_key
.tanstack/
apps/opensible-worker/bin/
```

(`.env`/`.env.*`/`node_modules`/`dist/` are already covered by existing rules.)

- [ ] **Step 2: Update AGENTS.md Layout section**

In `$RADAS/AGENTS.md`, inside the `apps/` block of the `## Layout` section, add these three entries (keep existing entries untouched):

```text
  opensible-console/  @radas/opensible-console (Vite + React 19 console, from OpenSible).
                        Run: pnpm --filter @radas/opensible-console dev (port 8080).
  opensible-server/   Flask API (Python 3.14). Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python app.py (port 5000). Depends on IaC via symlink IaC -> ../../templates/opensible-iac.
  opensible-worker/   Go worker (module github.com/opensible/worker-go, go >= 1.22). Run: go build -o bin/worker ./cmd/worker.
```

And under the `Layout` tree, add a line for the IaC templates dir:

```text
templates/     Only `docs/` and README.md are checked in; rest are external
               degit targets. `opensible-iac/` is the imported OpenSible
               OpenTofu/Ansible tree (see apps/opensible-server IaC symlink).
```

- [ ] **Step 3: Verify ignore rules**

```bash
cd "$RADAS" && git check-ignore apps/opensible-console/.tanstack && \
  git check-ignore apps/opensible-server/.venv/ && \
  git check-ignore apps/opensible-server/data/ && \
  git check-ignore apps/opensible-worker/bin/worker && \
  echo "gitignore rules active"
```

Expected: `git check-ignore` exits 0 for all four paths and prints them; final `gitignore rules active`. No commit.

---

### Task 6: Install workspace deps + run the console

**Files:**
- No new files (installs `apps/opensible-console` deps into the pnpm workspace).

**Interfaces:**
- Consumes: `@radas/opensible-console` (Task 1).
- Produces: running console dev server on :8080 that later tasks and the user can open.

- [ ] **Step 1: Install workspace dependencies**

```bash
cd "$RADAS" && pnpm install
```

Expected: exit 0; output lists `@radas/opensible-console` among workspace projects; `pnpm-lock.yaml` gains console deps (lockfile diff only).

- [ ] **Step 2: Start the console dev server (background)**

```bash
cd "$RADAS" && pnpm --filter @radas/opensible-console dev
```

Run in background. Wait for Vite to report it is listening.

- [ ] **Step 3: Verify the console responds**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/
```

Expected: `200`.

- [ ] **Step 4: Stop the console dev server**

Stop the background process from Step 2 (TaskStop / kill by PID). Confirm port is free:

```bash
curl -s -o /dev/null --max-time 2 http://localhost:8080/ && echo "still up" || echo "stopped"
```

Expected: `stopped`. No commit.

---

### Task 7: Boot the Flask server

**Files:**
- No new tracked files (venv + `/tmp` data dir are ignored/out of tree).

**Interfaces:**
- Consumes: `apps/opensible-server/` (Task 3, incl. IaC symlink).
- Produces: verified Python environment + bootable server on :5000.

- [ ] **Step 1: Create venv and install requirements**

```bash
cd "$RADAS/apps/opensible-server" && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt
```

Expected: exit 0 (installs Flask, flask-cors, ruamel.yaml, PyYAML, cryptography, requests, croniter, pytz, PyJWT, bcrypt, python-dotenv, flask-smorest, marshmallow, apispec, pydantic).

- [ ] **Step 2: Compile-check the Python tree**

```bash
cd "$RADAS/apps/opensible-server" && .venv/bin/python -m compileall -q app.py api api_v2 auth services utils schemas storage templates playbooks
```

Expected: exit 0, no output on success.

- [ ] **Step 3: Boot the server (background, isolated data dir)**

```bash
cd "$RADAS/apps/opensible-server" && DATA_DIR=/tmp/opensible-data .venv/bin/python app.py
```

Run in background. Give it ~8 s to initialize (blueprint registration, data dir creation).

- [ ] **Step 4: Verify it listens on :5000**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/ || true
```

Expected: `200` (or a defined error page — anything except connection-refused shows the server is up). If the process exits immediately, capture stderr and report the missing env requirement (e.g., `JWT_SECRET_KEY`) instead of masking it — the server may require secrets from `.env.example` to fully boot.

- [ ] **Step 5: Stop the server**

Stop the background process from Step 3. Confirm:

```bash
curl -s -o /dev/null --max-time 2 http://localhost:5000/ && echo "still up" || echo "stopped"
```

Expected: `stopped`. No commit.

---

### Task 8: Final integration report

**Files:**
- None (report only).

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Show the final tree and git status**

```bash
cd "$RADAS" && ls apps/opensible-* -d && ls templates/opensible-iac -d && \
  git status --short | wc -l
```

Expected: 4 new component dirs listed; `git status` shows the new files as untracked, plus the two modified files (`AGENTS.md`, `.gitignore`) and the design/plan docs — **all uncommitted** (Constraint 1).

- [ ] **Step 2: Summarize for the user**

Report in Indonesian: what was copied where, verification results of all 7 tasks (console :8080, server :5000, worker build, gitignore), what is deferred (commits, Docker image builds, worker module rename, console rebrand), and the upstream repo's unchanged status.