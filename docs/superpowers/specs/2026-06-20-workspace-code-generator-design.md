# Workspace Code Generator & Template System — Phase C Design

> **Phase:** C (following A: Monorepo Manager, B: Task Runner & Cache)
> **Status:** Design

## Motivation

Phase A and B let users discover and orchestrate their monorepo. Phase C adds
the missing "scaffold" piece: generating code from templates without leaving
the CLI. This replaces ad-hoc manual file copying with a declarative template
system that prompts for variables, renders Go templates, and integrates with
the existing degit-based remote workflow.

**Out of scope (handled by Phase A):** project-level `be init` / `fe init` /
`rootcmd sync_config` which clone full project templates. Those remain
specialized; `workspace generate` operates *within* an existing project.

## Template Structure

Each template is a subdirectory under `<workspace-root>/templates/` with a
`template.yml` manifest and one or more `.gotpl` Go template files:

```
templates/
├── react-component/
│   ├── template.yml
│   ├── Component.tsx.gotpl
│   ├── Component.css.gotpl
│   └── index.ts.gotpl
├── api-endpoint/
│   ├── template.yml
│   └── handler.go.gotpl
```

### template.yml Manifest

```yaml
name: react-component
description: Generate a React component with CSS module
version: 1
variables:
  - name: component_name
    description: Component name in PascalCase
    prompt: What is the component name?
    default: ""
    validate: "^[A-Z][a-zA-Z0-9]+$"
  - name: use_client
    type: confirm
    default: true
    prompt: Add 'use client' directive?
outputs:
  - template: Component.tsx.gotpl
    target: "{{.component_name}}/index.tsx"
  - template: Component.css.gotpl
    target: "{{.component_name}}/styles.module.css"
```

**Fields:**
- `name`: unique template name (matches directory name by convention)
- `description`: short help text shown in `template list`
- `version`: schema version (start at 1)
- `variables`: user-configurable inputs (see below)
- `outputs`: list of files to generate from `.gotpl` templates to target paths

**Variable types:**
- `string` (default): prompted via `survey.Input` with optional regex validation
- `confirm`: prompted via `survey.Confirm` (yes/no)

Future types (not in Phase C): `select`, `multiselect`.

## Template Engine (`internal/generator/`)

### Core Types

```go
type Definition struct {
    Name        string
    Description string
    Version     int
    Variables   []Variable
    Outputs     []Output
}

type Variable struct {
    Name        string
    Description string
    Prompt      string
    Default     string
    Type        string        // "string" or "confirm"
    Validate    string        // regex pattern, only for string type
}

type Output struct {
    Template string   // filename in template dir (e.g. "Component.tsx.gotpl")
    Target   string   // text/template for output path (e.g. "{{.name}}/index.tsx")
}
```

### Rendering Pipeline

1. **Parse**: read and unmarshal `template.yml`
2. **Resolve vars**: for each variable in `template.yml`:
   - If `--var key=val` provided, use that value
   - Otherwise, prompt interactively via survey
   - Validate against regex if specified (re-prompt on failure)
3. **Render**: for each `outputs` entry:
   - Read `.gotpl` file from disk
   - Execute `text/template` with resolved variable map as context
   - Evaluate `target` template to get output path (relative)
4. **Write**: create output directory tree, write rendered content
   - If target file exists: skip unless `--force` flag set
   - `--dry-run`: show what would be written without writing

### Prompt Logic

- **String vars**: `survey.Input` with message → prompt text, default → default
- **Confirm vars**: `survey.Confirm` with message → prompt text, default → default
- **Validation**: on string vars, compile regex and test. On failure, re-prompt
  with error message. Max 3 attempts then fail.

## Template Registry & Discovery

### Discovery Order

1. Local: scan `<workspace-root>/templates/` for subdirectories with
   `template.yml`
2. Remote: entries in `radas.yml workspace.generator.registry[]` — fetched on
   `template add`, cached locally

### Template Add (`template add <name> <source>`)

- Source is a degit URL (e.g., `raizora-id/radas-templates/react-component`)
- Downloads via `npx degit <source>`
- Unpacks to `<workspace-root>/templates/<name>/`
- Appends to `radas.yml workspace.generator.registry` as `{name, source}`

### Template Create (`template create <name>`)

- Creates `<workspace-root>/templates/<name>/`
- Writes a skeleton `template.yml` and empty `stub.gotpl`
- Registers nothing (purely a helper to get started)

### Config Changes (`radas.yml`)

```yaml
workspace:
  generator:
    templates_dir: templates        # default, relative to workspace root
    default_template:
      backend-api: go-api-handler   # optional: auto-suggest per project type
    registry:
      - name: react-component
        source: raizora-id/radas-templates/react-component
```

The `generator` block already exists in `WorkspaceConfig.Generator` as:

```go
type GeneratorConfig struct {
    TemplatesDir    string            `yaml:"templates_dir,omitempty"`
    DefaultTemplate map[string]string `yaml:"default_template,omitempty"`
    Registry        []string          `yaml:"registry,omitempty"`
}
```

**Change**: `Registry` field type from `[]string` to `[]RegistryEntry` where
each entry has `name` and `source` fields.

```go
type RegistryEntry struct {
    Name   string `yaml:"name"`
    Source string `yaml:"source"`
}
```

## CLI Commands

New subcommands added to `workspace` parent command:

```
radas workspace generate <template> [--var key=val]... [--output-dir=.] [--dry-run] [--force]
radas workspace template list
radas workspace template add <name> <source>
radas workspace template create <name>
```

### `workspace generate <template>`

| Flag | Default | Description |
|------|---------|-------------|
| `--var` | — | Repeatable: `--var name=Foo --var use_client=true` |
| `--output-dir` | `.` | Root directory for generated files |
| `--dry-run` | `false` | Show what would be generated, don't write |
| `--force` | `false` | Overwrite existing files without confirmation |

### `workspace template list`

Prints a table:

```
NAME              DESCRIPTION                      SOURCE
react-component   Generate a React component        local
go-api-handler    Generate Go HTTP handler           remote (raizora-id/...)
```

### `workspace template add <name> <source>`

Downloads remote template and stores locally. Updates radas.yml.

### `workspace template create <name>`

Scaffolds an empty template directory.

### Back-compat

Existing `fe gen-api`, `fe gen-styles`, `fe gen` are unchanged. No alias
wiring between `workspace generate` and `fe gen-*`.

## Data Flow (End to End)

```
User: radas workspace generate react-component --var component_name=Button

1. requireWorkspaceMode()
2. Build template list (scan <root>/templates/)
3. Find react-component/template.yml
4. Parse template.yml → Definition{Name, Variables, Outputs}
5. Resolve variables:
   - component_name = "Button" (from --var, skip prompt)
   - use_client → prompt via survey (default: true)
6. Render loop:
   - Component.tsx.gotpl → {{.component_name}} → Button → write to ./Button/index.tsx
   - Component.css.gotpl → write to ./Button/styles.module.css
7. Print: "Generated 2 files from react-component"
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Template not found | Error with list of available templates + hint for `template add` |
| Variable validation fails | Re-prompt with description of the pattern (max 3 attempts) |
| Output file exists | Warn + skip (default), overwrite with `--force` |
| Degit fetch fails | Error with network hint |
| Not in workspace mode | Standard `requireWorkspaceMode` error message |

## Testing Strategy

- **Unit tests** for `internal/generator/`:
  - Parse valid/invalid template.yml
  - Render .gotpl with variable map
  - Variable validation (regex match/fail)
  - Prompt resolution (mock survey)
- **Integration test** for `cmd/workspace/`:
  - Create template dir, run generate, verify files written
  - Run generate again → verify skip warning (or force overwrite)
  - Run template list → verify output shows template
  - Run template create → verify skeleton exists
- **Existing tests**: 272 passing must remain green. No regressions.

## File Structure

```
apps/cli/
├── internal/
│   └── generator/
│       ├── template.go         # Definition, Variable, Output types + Parse
│       ├── template_test.go
│       ├── engine.go           # Render function
│       ├── engine_test.go
│       ├── registry.go         # Template discovery (local scan)
│       ├── registry_test.go
│       ├── prompt.go           # survey-based variable resolution
│       └── prompt_test.go
└── cmd/workspace/
    ├── generate.go             # cobra command definition
    ├── run_generate.go         # runGenerate function
    ├── template.go             # cobra command definition (subcommands)
    ├── run_template.go         # runTemplateList/Add/Create functions
    ├── generate_test.go        # tests for generate commands
    └── template_test.go        # tests for template commands
```

No changes to existing `cmd/frontend/gen_*.go` or `internal/frontend/generator/`.

## Tasks (Implementation Plan)

The full implementation is decomposed into 12 TDD tasks:

1. **C1**: `Definition` types + `Parse` function for template.yml
2. **C2**: `Engine.Render` — render .gotpl with variable map to string
3. **C3**: Engine output resolution — evaluate target paths, write files
4. **C4**: `ResolveVariables` — merge `--var` flags with survey prompts
5. **C5**: `Registry.Scan` — scan `<root>/templates/` for valid templates
6. **C6**: `Registry.Add` — degit fetch + unpack + config update
7. **C7**: `workspace generate` command + `runGenerate`
8. **C8**: `workspace template list` command
9. **C9**: `workspace template add` command
10. **C10**: `workspace template create` command
11. **C11**: Integration test (create template → generate → verify 🔄 )
12. **C12**: Update GeneratorConfig Registry field type, CHANGELOG, tag

Expected test count: ~285 (272 + ~13 new tests).

## Self-Review Checklist

- [x] No TBDs or placeholders
- [x] Design matches user-approved answers (approach A, interactive+--var,
      workspace-local + remote, output-dir, no fe gen migration)
- [x] Architecture is focused — one subsystem (generator), no scope creep
- [x] No ambiguity: template structure, variable types, rendering pipeline,
      error handling all specified
- [x] Back-compat verified: no changes to `fe gen-*`, no changes to existing
      config field semantics (only Registry field type widens)
- [x] Testing strategy covers unit + integration
- [x] File structure is minimal and follows Phase A/B patterns
