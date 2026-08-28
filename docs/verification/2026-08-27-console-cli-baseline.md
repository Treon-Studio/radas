# RADAS Console–CLI Baseline — 2026-08-27

## Purpose

This baseline captures repository ownership and layout before the Console–CLI integration work. It was recorded for Phase 0 Task 0.1 before touching unrelated dirty files.

## Exact commands

```bash
git status --short
git rev-parse HEAD
find apps -maxdepth 1 -mindepth 1 -type d -print | sort
go version
node --version
pnpm --version
python3 --version
rg -n '(@[^[:space:]]*\\.route\\(|add_url_rule\\()' apps/server --glob '*.py' | wc -l | tr -d ' '
./scripts/verify-repo-layout.sh
git diff --check
```

## Repository state at capture

Initial `git rev-parse HEAD`:

```text
3c54070596f82ace1384d29ee02078f3bbd6c4e7
```

Initial `git status --short`:

```text
 M apps/console/public/images/haro-animated.gif
 M apps/console/public/images/haro-animated.webp
 M apps/console/public/images/haro-mascot.png
 M apps/console/public/images/haro-mascot.webp
 M apps/console/public/images/hero-pixel-landscape-animated.webp
 M apps/console/public/images/hero-pixel-landscape.png
 M apps/console/public/images/hero-pixel-landscape.webp
 M apps/console/public/videos/hero-pixel-landscape.mp4
 M apps/console/src/routes/index.tsx
 M apps/console/src/routes/login.tsx
 M apps/console/src/styles.css
 M pnpm-workspace.yaml
```

The initial checkout also contained the following untracked console assets and planning/audit documents; they were pre-existing and were not staged:

```text
apps/console/public/images/feature-island-byoc.png
apps/console/public/images/feature-island-byoc.webp
apps/console/public/images/feature-island-finops.png
apps/console/public/images/feature-island-finops.webp
apps/console/public/images/feature-island-gitops.png
apps/console/public/images/feature-island-gitops.webp
apps/console/public/images/feature-pixel-byoc-clean.png
apps/console/public/images/feature-pixel-byoc-clean.webp
apps/console/public/images/feature-pixel-byoc-craft.png
apps/console/public/images/feature-pixel-byoc-craft.webp
apps/console/public/images/feature-pixel-dev-party.png
apps/console/public/images/feature-pixel-dev-party.webp
apps/console/public/images/feature-pixel-finops-clean.png
apps/console/public/images/feature-pixel-finops-clean.webp
apps/console/public/images/feature-pixel-finops-craft.png
apps/console/public/images/feature-pixel-finops-craft.webp
apps/console/public/images/feature-pixel-gitops-clean.png
apps/console/public/images/feature-pixel-gitops-clean.webp
apps/console/public/images/feature-pixel-gitops-craft.png
apps/console/public/images/feature-pixel-gitops-craft.webp
apps/console/public/images/feature-pixel-quest-card.png
apps/console/public/images/feature-pixel-quest-card.webp
apps/console/public/images/feature-pixel-rocket.png
apps/console/public/images/feature-pixel-rocket.webp
apps/console/public/images/footer-pixel-grass.png
apps/console/public/images/footer-pixel-grass.webp
apps/console/public/images/gemini-banana-animated.gif
apps/console/public/images/hero-pixel-bottom-fringe.png
apps/console/public/images/hero-pixel-bottom-fringe.webp
apps/console/public/images/section-sky-trees-backdrop.png
apps/console/public/images/section-sky-trees-backdrop.webp
apps/console/public/images/sky-bottom-dither-sync.png
apps/console/public/images/sky-bottom-dither-sync.webp
apps/console/public/images/sky-bottom-dither.png
apps/console/public/images/sky-bottom-dither.webp
apps/console/public/images/sky-pixel-dither-bottom.png
apps/console/public/images/sky-pixel-dither-bottom.webp
apps/console/public/images/sky-pixel-dither-top.png
apps/console/public/images/sky-pixel-dither-top.webp
apps/console/public/images/sky-top-dither-sync.png
apps/console/public/images/sky-top-dither-sync.webp
apps/console/public/images/sky-top-dither.png
apps/console/public/images/sky-top-dither.webp
apps/console/public/images/sky-tree-left.png
apps/console/public/images/sky-tree-left.webp
apps/console/public/images/console-cli-integration-audit-2026-08-27.md
 docs/superpowers/plans/2026-08-27-radas-console-cli-full-integration.md
 docs/superpowers/plans/2026-08-27-radas-flow-gap-closure-by-phase.md
```

## Actual application paths

```text
apps/cli
apps/console
apps/data
apps/desktop-app
apps/server
apps/worker
```

Task-required paths all exist: `apps/server`, `apps/console`, `apps/cli`, and `apps/worker`.

## Tool versions

```text
go version go1.25.5 darwin/arm64
v22.23.1
11.24.0
Python 3.14.6
```

The values correspond to `go version`, `node --version`, `pnpm --version`, and `python3 --version`, respectively. pnpm emits a warning about the legacy root `pnpm` field; this was not changed because `pnpm-workspace.yaml` is pre-existing dirty scope.

## Route count

The initial route declaration count command returned:

```text
623
```

The verification script uses the same declaration pattern and reports `623`.

## Stale-path check

The script scans executable/configuration files and fails on active references to `apps/opensible-server` or `apps/radas-console`, while ignoring comment-only lines. The check passes. Historical/comment references in `AGENTS.md`, `README.md`, `ecosystem.config.cjs`, and a lockfile reference remain outside Task 0.1 scope and were not modified.

## Final validation

```bash
./scripts/verify-repo-layout.sh
git diff --check
```

Both passed. Only `scripts/verify-repo-layout.sh` and this baseline document are task-owned commit files; pre-existing dirty files remain unstaged.
