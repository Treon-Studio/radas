# Changelog

## [Unreleased]

### Added

- `workspace run <task> [--project|--all|--affected]` — topological task execution with cache (Phase B)
- `workspace affected [--base|--json]` — list projects affected by git changes
- `workspace cache status|clear` — local cache management
- `internal/cache/` — content-addressable cache (SHA256, FS-backed at `~/.radas/cache/`)
- `internal/runner/` — pipeline resolution, layered Kahn's scheduler, parallel batch executor, summary table
- `internal/graph/affected.go` — git diff → affected project set with transitive expansion
- `workspace` command group (Phase A: Monorepo Manager)
  - `workspace init` — generate radas.yml with workspace section
  - `workspace list` — table of all projects
  - `workspace show <name>` — project details + dependencies
  - `workspace graph [--ascii|--output=svg|png|json|--web]` — dependency visualization
  - `workspace validate` — check for cycles and stale patterns
- `internal/workspace/` package: scanner, detectors (radasyml/go/node), parser
- `internal/project/` package: Project data model
- `internal/graph/` package: dominikbraun/graph wrapper, ASCII/DOT/SVG renderers, web viewer
- Configuration: `RadasConfig.Workspace` (optional block; presence enables workspace mode)
