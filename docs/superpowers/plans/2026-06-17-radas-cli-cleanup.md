# RADAS CLI Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code, fix layer placement, add godoc, and bump major version in the `radas` Go CLI.

**Architecture:** Pure deletion + small in-place godoc additions. No new packages, no new tests, no moves. The live `internal/config/` is already in the right place; the dead `cmd/config/`, `cmd/frontend/config.go`, and `internal/frontend/styles/` are removed. Godoc is added to symbols in touched packages. `constants.Version` is bumped to `"4.0.0"`.

**Tech Stack:** Go 1.25, Cobra (cobra.Command), YAML (gopkg.in/yaml.v3).

> **Plan revised 2026-06-17:** Original Task 2 (delete `cmd/frontend/config.go`)
> was removed after verification. The file is live code. Tasks are now
> renumbered: what was Task 3 is now Task 2, and so on.

> **Commits:** The repo's `AGENTS.md` says "Only commit ... when explicitly requested." Each task's commit step is OPTIONAL — execute it only if the user has asked to commit progress along the way. Otherwise skip and present the diff at the end.

---

## File Structure

**Deleted (3 packages/files):**
- `apps/cli/cmd/config/` — whole directory. Dead duplicate of `internal/config/`.
- `apps/cli/cmd/frontend/config.go` — single file. Dead code, all 4 funcs/types unused.
- `apps/cli/internal/frontend/styles/` — whole directory (476 lines). Dead duplicate of `internal/frontend/generator/styles/`.

**Modified (4 files, godoc + version bump only):**
- `apps/cli/internal/config/parser.go` — add package doc + godoc on `RadasConfig` struct.
- `apps/cli/cmd/frontend/dev.go` — add godoc on `PackageJSON` struct (line ~46).
- `apps/cli/internal/utils/filesystem.go` — add godoc on `PackageJSON` struct (line ~11).
- `apps/cli/constants/version.go` — `Version = "0.2.0"` → `Version = "4.0.0"`.

**No new files, no test changes, no `go.mod` changes.**

---

## Baseline (run before starting)

Run from `apps/cli/`:

```bash
cd apps/cli
go build ./...         # expect: exit 0
go vet ./...           # expect: exit 0, no output
go test -count=1 ./... # expect: 52 passed
go build -o /tmp/radas-baseline && /tmp/radas-baseline --help > /tmp/radas-help-baseline.txt
```

Save `/tmp/radas-help-baseline.txt` for later comparison.

---

## Task 1: Delete `cmd/config/` (dead duplicate of `internal/config/`)

**Files:**
- Delete: `apps/cli/cmd/config/parser.go`
- Delete: `apps/cli/cmd/config/` directory (becomes empty after step 1)

**Why:** The `cmd/config/` package is a byte-identical duplicate of the live `internal/config/`. All four consumers in `cmd/rootcmd/*` import `"radas/internal/config"`, not `"radas/cmd/config"`. Zero importers → safe to delete.

- [ ] **Step 1: Delete the dead package**

```bash
cd apps/cli
rm cmd/config/parser.go
rmdir cmd/config
```

- [ ] **Step 2: Verify build, vet, tests still pass**

```bash
cd apps/cli
go build ./...
go vet ./...
go test -count=1 ./...
```

Expected: all three exit 0; tests still report 52 passed.

- [ ] **Step 3: Verify no references to `cmd/config` remain**

```bash
cd apps/cli
grep -rn "cmd/config" --include="*.go" .
```

Expected: no output (zero matches). If anything matches, that file was using the dead package and must be updated to use `internal/config` instead.

- [ ] **Step 4: Commit (optional — only if user asked to commit)**

```bash
git add apps/cli/cmd/config/
git commit -m "refactor(cli): remove dead cmd/config duplicate of internal/config"
```

---

## ~~Task 2: Delete `cmd/frontend/config.go`~~ — REMOVED

**Status:** Removed 2026-06-17 after verification. `cmd/frontend/config.go`
is **live code**: `RadasConfig`, `FindConfig`, `ParseConfig`, `ResolvePath`
defined there are used by `cmd/frontend/{gen_all.go, gen_api.go, gen_styles.go}`
(9 call sites). The original plan's grep (`frontend.FindConfig`) did not
match these because intra-package calls don't require a package prefix.
The file stays. The two `RadasConfig` types are a legitimate
shared-kernel / domain-model pair (DDD-valid), similar to the two
`PackageJSON` types. No further action.

Original task description preserved for reference below.

<details>
<summary>Original Task 2 (do not execute)</summary>

**Files:** Delete: `apps/cli/cmd/frontend/config.go`

**Why (was thought to be true):** All four exports were claimed unused.
`ResolvePath` was claimed to have a dead `__generated__` branch.

**Verified during implementation:** The 4 exports are called by
`gen_all.go`, `gen_api.go`, `gen_styles.go`. The `__generated__` branch
is exercised by callers passing `cfg.Contract.Design[0].Path` /
`cfg.Contract.API[0].Path`. Removing breaks `go build ./...`. The
implementer correctly identified the error, restored the file, and
reported BLOCKED.

</details>

---

## Task 2 (renamed): Delete `internal/frontend/styles/` (476-line dead duplicate)

**Files:**
- Delete: `apps/cli/internal/frontend/styles/generator.go`
- Delete: `apps/cli/internal/frontend/styles/` directory

**Why:** The `internal/frontend/styles/` package is byte-identical to the canonical `internal/frontend/generator/styles/` package (same `StylesGenerator`, `NewStylesGenerator`, `TokenData`, same `Generate()` and helpers). Only the canonical one (`internal/frontend/generator/styles`) is imported by `internal/frontend/generator/generator.go:6`. Zero importers of the dead copy.

- [ ] **Step 1: Delete the dead package**

```bash
cd apps/cli
rm internal/frontend/styles/generator.go
rmdir internal/frontend/styles
```

- [ ] **Step 2: Verify build, vet, tests still pass**

```bash
cd apps/cli
go build ./...
go vet ./...
go test -count=1 ./...
```

Expected: all three exit 0; tests still report 52 passed.

- [ ] **Step 3: Verify no refs to the dead package remain**

```bash
cd apps/cli
grep -rn "internal/frontend/styles" --include="*.go" .
```

Expected: no output. (Only the canonical `internal/frontend/generator/styles` should be referenced.)

- [ ] **Step 4: Commit (optional)**

```bash
git add apps/cli/internal/frontend/styles/
git commit -m "refactor(cli): remove 476-line dead duplicate of generator/styles"
```

---

## Task 4: Add godoc to `internal/config` package and symbols

**Files:**
- Modify: `apps/cli/internal/config/parser.go`

**Why:** The package currently has no package doc. `RadasConfig` has a one-line godoc but no field-level docs. `ParseConfig`, `FindConfig`, `ResolvePath` have no godoc. Adding concise godoc makes `go doc` and editor hovers useful.

- [ ] **Step 1: Add package doc above `package config`**

In `apps/cli/internal/config/parser.go`, replace the first line `package config` with:

```go
// Package config parses the project-level radas.yml file shared by every
// team command (frontend, backend, devops, design). It exposes the schema
// (RadasConfig), discovery (FindConfig), and path resolution (ResolvePath).
package config
```

- [ ] **Step 2: Add field-level godoc to `RadasConfig`**

Replace the `RadasConfig` struct definition (lines 13-28 in the current file) with:

```go
// RadasConfig represents the structure of radas.yml.
type RadasConfig struct {
	// Name is the human-readable project name.
	Name string `yaml:"name"`
	// Description is a one-line project summary.
	Description string `yaml:"description"`
	// Type is the project archetype (e.g. "be", "fe", "infra").
	Type string `yaml:"type"`
	// Stacks lists the technology stacks used (e.g. ["go", "gin"]).
	Stacks []string `yaml:"stacks"`
	// Contract describes the design and API inputs the project consumes.
	Contract struct {
		// Design lists design-token input files.
		Design []struct {
			Path string `yaml:"path"`
			Type string `yaml:"type"`
		} `yaml:"design"`
		// API lists OpenAPI input specs.
		API []struct {
			Path string `yaml:"path"`
			Type string `yaml:"type"`
		} `yaml:"api"`
	} `yaml:"contract"`
}
```

- [ ] **Step 3: Add godoc to `ParseConfig`**

Find the line:
```go
// ParseConfig reads and parses the radas.yml file
func ParseConfig(configPath string) (*RadasConfig, error) {
```

Replace with:
```go
// ParseConfig reads and parses the radas.yml file at configPath. If
// configPath is a directory, radas.yml inside it is used. Returns the
// parsed config or a wrapped error.
func ParseConfig(configPath string) (*RadasConfig, error) {
```

- [ ] **Step 4: Add godoc to `FindConfig`**

Find the line:
```go
// FindConfig looks for radas.yml in the current directory and parent directories
func FindConfig() (string, error) {
```

Replace with:
```go
// FindConfig searches the current working directory and walks up parent
// directories looking for radas.yml. Returns the absolute path to the
// first match, or an error if none is found before the filesystem root.
func FindConfig() (string, error) {
```

- [ ] **Step 5: Add godoc to `ResolvePath`**

Find the line:
```go
// ResolvePath resolves a path from the configuration file
// If the path starts with ${RADAS_PLAYGROUND}, it will be replaced with the value of the RADAS_PLAYGROUND environment variable
// Otherwise, the path is assumed to be relative to the configuration file's directory
func ResolvePath(basePath, configPath string) string {
```

Replace with:
```go
// ResolvePath resolves configPath against basePath. Resolution order:
//  1. If configPath contains ${RADAS_PLAYGROUND} and the env var is set,
//     the placeholder is substituted with the env var value.
//  2. If configPath is absolute, it is returned unchanged.
//  3. If RADAS_PLAYGROUND is set, configPath is treated as relative to it.
//  4. Otherwise configPath is treated as relative to basePath.
func ResolvePath(basePath, configPath string) string {
```

- [ ] **Step 6: Verify build, vet, tests still pass and godoc renders**

```bash
cd apps/cli
go build ./...
go vet ./...
go test -count=1 ./...
go doc -all ./internal/config | head -40
```

Expected: build/vet/test exit 0. `go doc -all` shows the package doc, type doc with fields, and each function's godoc.

- [ ] **Step 7: Commit (optional)**

```bash
git add apps/cli/internal/config/parser.go
git commit -m "docs(cli): add godoc to internal/config package and symbols"
```

---

## Task 5: Add godoc to `cmd/frontend.PackageJSON`

**Files:**
- Modify: `apps/cli/cmd/frontend/dev.go` (around line 46)

**Why:** The frontend-domain `PackageJSON` is intentionally distinct from
`internal/utils.PackageJSON` (different fields: `Private`, `PublishConfig`).
Without godoc, a reader could mistake it for a duplicate. A one-line godoc
clarifies the domain.

- [ ] **Step 1: Add godoc to the `PackageJSON` struct**

In `apps/cli/cmd/frontend/dev.go`, find:

```go
// PackageJSON structure for parsing package.json
type PackageJSON struct {
	Name          string            `json:"name"`
	Version       string            `json:"version"`
	Private       bool              `json:"private"`
	Scripts       map[string]string `json:"scripts"`
	PublishConfig map[string]string `json:"publishConfig,omitempty"`
}
```

Replace with:

```go
// PackageJSON is the frontend-domain subset of a frontend app's
// package.json. It tracks fields relevant to selecting, running, and
// publishing apps via the `fe` command family. This is intentionally
// narrower than internal/utils.PackageJSON, which carries dependency
// lists for monorepo scanning.
type PackageJSON struct {
	Name          string            `json:"name"`
	Version       string            `json:"version"`
	Private       bool              `json:"private"`
	Scripts       map[string]string `json:"scripts"`
	PublishConfig map[string]string `json:"publishConfig,omitempty"`
}
```

- [ ] **Step 2: Verify build, vet, tests still pass**

```bash
cd apps/cli
go build ./...
go vet ./...
go test -count=1 ./...
```

Expected: all exit 0; tests still report 52 passed.

- [ ] **Step 3: Commit (optional)**

```bash
git add apps/cli/cmd/frontend/dev.go
git commit -m "docs(cli): clarify frontend PackageJSON domain scope in godoc"
```

---

## Task 6: Add godoc to `internal/utils.PackageJSON`

**Files:**
- Modify: `apps/cli/internal/utils/filesystem.go` (around line 11)

**Why:** The other `PackageJSON` got godoc in Task 5; this one (used by
`internal/checker` for monorepo scanning) should also have one for
symmetry and to clarify why the two types differ.

- [ ] **Step 1: Add godoc to the `PackageJSON` struct**

In `apps/cli/internal/utils/filesystem.go`, find:

```go
// PackageJSON represents a package.json file
type PackageJSON struct {
	Name     string            `json:"name"`
	Version  string            `json:"version"`
	Scripts  map[string]string `json:"scripts"`
	DevDeps  map[string]string `json:"devDependencies"`
	Deps     map[string]string `json:"dependencies"`
	PeerDeps map[string]string `json:"peerDependencies"`
}
```

Replace with:

```go
// PackageJSON is the scanner-domain subset of a package.json, used by
// internal/checker to walk monorepos and identify apps. It tracks name,
// version, scripts, and dependency lists. For a frontend-specific
// subset (private flag, publishConfig) used by the `fe` command family,
// see cmd/frontend.PackageJSON.
type PackageJSON struct {
	Name     string            `json:"name"`
	Version  string            `json:"version"`
	Scripts  map[string]string `json:"scripts"`
	DevDeps  map[string]string `json:"devDependencies"`
	Deps     map[string]string `json:"dependencies"`
	PeerDeps map[string]string `json:"peerDependencies"`
}
```

- [ ] **Step 2: Verify build, vet, tests still pass**

```bash
cd apps/cli
go build ./...
go vet ./...
go test -count=1 ./...
```

Expected: all exit 0; tests still report 52 passed.

- [ ] **Step 3: Commit (optional)**

```bash
git add apps/cli/internal/utils/filesystem.go
git commit -m "docs(cli): clarify internal/utils PackageJSON domain scope in godoc"
```

---

## Task 7: Bump `constants.Version` to `"4.0.0"`

**Files:**
- Modify: `apps/cli/constants/version.go`

**Why:** Major version bump from `0.2.0` to `4.0.0` reflects the hard
break the user accepted. The CLI's own `version` command, the
`internal/updater` self-update check, and `install.sh` all read this
constant.

- [ ] **Step 1: Read the current version constant**

```bash
cd apps/cli
cat constants/version.go
```

The file currently has (or similar):
```go
const Version = "0.2.0"
```

- [ ] **Step 2: Replace with `"4.0.0"`**

In `apps/cli/constants/version.go`, change:
```go
const Version = "0.2.0"
```

to:
```go
const Version = "4.0.0"
```

- [ ] **Step 3: Verify build, vet, tests still pass and the new value is reported**

```bash
cd apps/cli
go build -o /tmp/radas ./...
/tmp/radas version | head -5
go test -count=1 ./...
```

Expected: build/test exit 0; `radas version` shows the new version string (`4.0.0` or similar). If the version output is in a different format, just confirm the constant value changed in the file.

- [ ] **Step 4: Commit (optional)**

```bash
git add apps/cli/constants/version.go
git commit -m "chore(cli): bump Version to 4.0.0 (major: dead code removed)"
```

---

## Task 8: Final verification

**Why:** Catch any cross-cutting issues introduced by the deletions or
godoc additions. Confirms the binary behavior is unchanged.

- [ ] **Step 1: Run all gates**

```bash
cd apps/cli
go build ./...
go vet ./...
go test -count=1 ./...
```

Expected: all three exit 0; tests report 52 passed (same as baseline).

- [ ] **Step 2: Diff the `--help` output against the baseline**

```bash
cd apps/cli
go build -o /tmp/radas .
/tmp/radas --help > /tmp/radas-help-after.txt
diff /tmp/radas-help-baseline.txt /tmp/radas-help-after.txt
```

Expected: no output from `diff` (identical help text). Any output means
the user-facing surface changed and must be investigated.

- [ ] **Step 3: Verify spec success criteria**

```bash
cd apps/cli
grep -rn "cmd/config" --include="*.go" .            # expect: no output
grep -rn "internal/frontend/styles" --include="*.go" . # expect: no output
grep -rn "internal/config" --include="*.go" .       # expect: matches only internal/config/parser.go + parser_test.go + the 4 cmd/rootcmd consumers
grep '"4.0.0"' constants/version.go                  # expect: one match
```

- [ ] **Step 4: Show the user the final diff**

```bash
cd /Users/ridho/Documents/go/github.com/raizora/radas
git status
git diff --stat
```

Report the file list to the user. If the user wants to commit, do so in a single commit with message:

```bash
git add -A
git commit -m "refactor(cli): remove dead code, add godoc, bump to 4.0.0

- Remove cmd/config/ (dead duplicate of internal/config/)
- Remove cmd/frontend/config.go (dead code, unused exports)
- Remove internal/frontend/styles/ (476-line byte-identical duplicate)
- Add godoc to internal/config, cmd/frontend.PackageJSON, internal/utils.PackageJSON
- Bump Version to 4.0.0 (major: hard break accepted)"
```

---

## Spec coverage check

| Spec section | Implemented in |
|---|---|
| Audit: live vs dead | Tasks 1, 2, 3 (deletions target the right files) |
| Goal: ~600 lines of dead code removed | Tasks 1, 2, 3 (parser.go ~100 lines, config.go ~106 lines, styles/generator.go ~476 lines ≈ 680 lines) |
| Layout after cleanup | Tasks 1, 2, 3 (deletions match the diagram) |
| DDD rationale | Task 5 + Task 6 godoc cross-references make the two `PackageJSON` types explicitly distinct |
| Delete dead code (3 items) | Tasks 1, 2, 3 (one per item) |
| No moves | No task moves files; verified by absence of move steps |
| No new tests | No task creates a new `_test.go`; existing `internal/config/parser_test.go` is unchanged |
| Godoc additions (3 items) | Tasks 4, 5, 6 (one per touched package) |
| Version bump | Task 7 |
| Success criteria | Task 8 verifies every criterion in the spec |
| Implementation order | Tasks 1–8 follow the spec's 8-step order |

## Self-review notes

- All 7 deletion/godoc/version-bump steps have explicit verification (build + vet + test).
- File paths use the full repo-relative form.
- No "TBD", "TODO", "implement later" placeholders.
- No "add appropriate error handling" hand-waves — godoc additions don't add code paths.
- Type consistency: the `PackageJSON` references in Tasks 5 and 6 cross-link
  to each other correctly (frontend ↔ utils).
- `internal/config/parser_test.go` is referenced as "unchanged" in Task 4
  and is never modified.
- Baseline capture is the first step; comparison in Task 8 closes the loop.
