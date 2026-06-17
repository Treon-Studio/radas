# RADAS CLI Cleanup — Design

**Date:** 2026-06-17
**Status:** Approved, awaiting implementation plan
**Module:** `radas` (Go, at `apps/cli/`)
**Target CLI version:** v4.0.0 (major bump from v3.x)

## Problem

The `radas` Go CLI has accumulated dead code and structural drift that
makes the codebase harder to navigate. Three kinds of issue:

1. **Dead code** — `cmd/config/parser.go` is a dead duplicate of the live
   `internal/config/parser.go`. `cmd/frontend/config.go` (RadasConfig
   copy with an unused `__generated__` branch) has zero importers.
   `internal/frontend/styles/generator.go` is a 476-line byte-identical
   copy of the canonical `internal/frontend/generator/styles/generator.go`.
2. **Layer confusion** — the file at `cmd/config/` was placed in
   `cmd/` (presentation) but is shared infrastructure; meanwhile the
   live equivalent sits in `internal/config/` where it belongs.
3. **Missing godoc** on a few exported symbols in touched packages.

Net effect: ~600 lines of dead code, one dead package
(`cmd/config/`, plus the 476-line `internal/frontend/styles/`),
and confusing layer placement.

## Audit: what is live vs dead

Verified via `go build`, `go vet`, `go test` (52/52 pass) and direct
inspection of every consumer:

| Item | Location | Status | Evidence |
|---|---|---|---|
| `RadasConfig`, `FindConfig`, `ParseConfig`, `ResolvePath` | `internal/config/parser.go` | **Live** | Imported by `cmd/rootcmd/{config.go, sync_config.go, sync_repo.go, config_test.go}` (4 files) |
| `RadasConfig` test | `internal/config/parser_test.go` | **Live** | 163 lines of real tests covering `ParseConfig`, `FindConfig`, `ResolvePath` |
| Same source (identical byte-for-byte) | `cmd/config/parser.go` | **Dead** | Zero importers |
| Same source (with one extra `__generated__` branch in `ResolvePath`) | `cmd/frontend/config.go` | **Live** | Used by `cmd/frontend/{gen_all.go, gen_api.go, gen_styles.go}` (9 call sites). Intra-package calls don't need a package prefix, so a repo-wide `grep "frontend.FindConfig"` misses them. The two `RadasConfig` types are structurally identical but `ResolvePath` differs (frontend has the `__generated__` branch and the canonical `internal/config.ResolvePath` does not). DDD-valid: keep both, similar to how `cmd/frontend.PackageJSON` and `internal/utils.PackageJSON` are kept distinct. |
| `StylesGenerator`, `NewStylesGenerator`, `TokenData` (476 lines) | `internal/frontend/generator/styles/generator.go` | **Live** | Imported by `internal/frontend/generator/generator.go:6` |
| Same (476 lines, byte-identical) | `internal/frontend/styles/generator.go` | **Dead** | Zero importers |
| `PackageJSON` (fields: `DevDeps`, `Deps`, `PeerDeps`) + `ReadPackageJSON` | `internal/utils/filesystem.go` | **Live** | Used by `internal/checker/node.go:215` |
| `PackageJSON` (fields: `Private`, `PublishConfig`) | `cmd/frontend/dev.go:46` | **Live** | Used internally in `cmd/frontend/dev.go`. **DDD-valid** — different schema for different concern (app scanning vs publishing). Stays |

## Goal

End state: ~600 lines of dead code removed, zero dead packages, all
exports in touched packages have godoc, all tests still pass, CLI binary
still produces the same commands and output.

## Design

### Layout after cleanup

```
apps/cli/
  cmd/
    backend/          (unchanged)
    design/           (unchanged)
    devops/           (unchanged)
    frontend/         (config.go REMOVED; dev.go keeps its PackageJSON)
    infra/            (unchanged)
    rootcmd/          (unchanged — already imports internal/config)
    config/           REMOVED
  internal/
    config/           (unchanged — already the canonical location)
    checker/          (unchanged)
    frontend/
      generator/      (unchanged)
        styles/       (unchanged — canonical)
      parser/         (unchanged)
      styles/         REMOVED
    updater/          (unchanged)
    utils/            (unchanged)
  constants/version.go   Version bumped to "4.0.0"
```

### DDD rationale

- `internal/config` is **shared kernel**: same `radas.yml` schema parsed
  the same way regardless of which team command invokes it. Belongs in
  `internal/`, not `cmd/`. Already in the right place.
- `cmd/frontend.PackageJSON` is a **domain model** for the frontend
  publishing flow. Different fields than `internal/utils.PackageJSON`
  because the concerns differ (private flag, publishConfig for npm).
  Stays in `cmd/frontend/`.
- The 476-line `internal/frontend/styles/` package is pure dead code
  (not a domain model) and is deleted.

### What changes

1. **Delete dead code** (2 files / packages):
   - `apps/cli/cmd/config/parser.go` and the whole `cmd/config/`
     directory
   - `apps/cli/internal/frontend/styles/generator.go` and the whole
     `internal/frontend/styles/` directory

   **Originally listed:** `apps/cli/cmd/frontend/config.go` was also
   marked for deletion. Verification during implementation
   (Task 2 in the plan, 2026-06-17) found that the four exports are
   used by sibling files in the same package (`gen_all.go`,
   `gen_api.go`, `gen_styles.go`, 9 call sites). `cmd/frontend/config.go`
   is **live code** and stays. The two `RadasConfig` types are
   DDD-valid shared-kernel and domain-model pair, similar to the two
   `PackageJSON` types.

2. **No moves.** `internal/config/` is already the canonical location
   used by every consumer. `cmd/rootcmd/*` already imports
   `"radas/internal/config"`.

3. **No new tests.** `internal/config/parser_test.go` already exists
   (163 lines) and covers the live code. It is not changed. The dead
   `cmd/config/parser_test.go` (if it existed — it does not) would be
   removed with `cmd/config/`.

4. **Godoc additions** for symbols in touched packages:
   - `internal/config` — package doc + `RadasConfig` struct +
     `ParseConfig` + `FindConfig` + `ResolvePath` (currently no
     package doc, only one-line godoc on the type)
   - `cmd/frontend.PackageJSON` — currently no godoc
   - `internal/utils.PackageJSON` — currently no godoc
   - Skipped: `cmd/rootcmd` (24 cobra commands already have one-liner
     descriptions; package is large and not in scope)

5. **Version bump**:
   - `apps/cli/constants/version.go`: `Version = "0.2.0"` →
     `Version = "4.0.0"`
   - Major bump per chosen scope (hard break acceptable)

### What does NOT change

- No changes to `cmd/backend`, `cmd/design`, `cmd/devops`, `cmd/infra`
- No changes to `internal/checker`, `internal/frontend/generator`,
  `internal/frontend/parser`, `internal/updater`
- No moves of any package or file
- No new test files
- No new test cases
- No refactor of working logic
- No CLI surface changes (commands, flags, output all identical)
- No `go.mod` / `go.sum` changes (no new dependencies)
- No removal of `cmd/frontend.PackageJSON` (DDD-valid model)

## Success criteria

After implementation, the following must all hold:

- `cd apps/cli && go build ./...` — exit 0
- `cd apps/cli && go vet ./...` — exit 0
- `cd apps/cli && go test -count=1 ./...` — 52 passed (same as
  baseline; no new tests, no deleted tests)
- `cd apps/cli && go build -o /tmp/radas && /tmp/radas --help` —
  identical output to current `radas --help`
- `grep -rn "cmd/config" --include="*.go" apps/cli/` returns zero hits
- `grep -rn "internal/frontend/styles" --include="*.go" apps/cli/`
  returns zero hits
- `grep -rn "internal/config" --include="*.go" apps/cli/` matches only
  the existing `internal/config` package and its single test file
- `apps/cli/constants/version.go` shows `Version = "4.0.0"`

## Risks

- **Wrong dead-code assumption.** Risk: a `RadasConfig` consumer exists
  outside `cmd/rootcmd/*` (e.g. via reflection, build tag, or generated
  code) and the build breaks when we delete `cmd/config/`. Mitigation:
  `go build ./...` and `go test ./...` are the canonical check; both
  are part of success criteria. If either fails, the deletion is
  rolled back.
- **Stale test.** Risk: `internal/config/parser_test.go` tests behavior
  that the live code no longer has. Mitigation: the test was already
  passing on the current `main` branch (52/52 baseline). If it stays
  green after the deletions, it is correct.
- **Version string drift.** Risk: `constants.Version` is read by
  `install.sh` and `internal/updater.CheckForUpdate()`. Mitigation: the
  new value `"4.0.0"` is what `updater` will compare against on GitHub
  releases. The next release must be tagged `v4.0.0` (or `4.0.0` per
  repo convention) for the self-update check to find it.

## Out of scope

- Tests for currently-untested packages
  (`cmd/backend`, `cmd/infra`, `internal/checker`,
  `internal/frontend/parser`, `internal/updater`)
- Reorganizing `cmd/<team>/` package structures
- Refactoring working code in `cmd/frontend/MockServer`,
  `cmd/infra/docker_*`, `internal/updater`, etc.
- Adding dependencies (e.g. `testify`) or upgrading Go version
- Documentation beyond godoc on touched symbols
- `go.mod` cleanup

## Implementation order

1. Delete `apps/cli/cmd/config/` (whole directory). Verify
   `go build ./...` and `go test -count=1 ./...` still pass.
2. Delete `apps/cli/cmd/frontend/config.go`. Verify build + tests.
3. Delete `apps/cli/internal/frontend/styles/` (whole directory).
   Verify build + tests.
4. Add godoc to `internal/config` (package doc + symbol docs).
5. Add godoc to `cmd/frontend.PackageJSON`.
6. Add godoc to `internal/utils.PackageJSON`.
7. Bump `apps/cli/constants/version.go` to `"4.0.0"`.
8. Final verification: build + vet + test + `--help` output diff.

Each step is independently verifiable; if any step breaks the build
or tests, that step is reverted before continuing.

## Open questions

None. Scope, approach, and breaking-change policy all decided.
