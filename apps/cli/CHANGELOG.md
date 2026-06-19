# Changelog

## [Unreleased]

### Added

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
