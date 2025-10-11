# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Radas is a powerful CLI tool and documentation site that revolutionizes developer workflows by automating API client generation and project scaffolding. The repository is a monorepo containing:

- **CLI Tool (Go)**: A command-line interface in `apps/cli` that generates type-safe API clients from OpenAPI specifications
- **Documentation Site (Next.js)**: A documentation website in `apps/web` built with Next.js, Fumadocs, and TailwindCSS

The core value proposition is generating modern API clients with React Query hooks, Zod validation, TypeScript types, and Zustand stores from OpenAPI specifications.

## Repository Structure

### Monorepo Organization

This is a pnpm workspace with the following structure:

```
apps/
├── cli/          # Go CLI application (main product)
│   ├── cmd/      # Command definitions organized by team (frontend, backend, devops, design)
│   ├── internal/ # Core implementation (generators, parsers, templates)
│   └── main.go   # Entry point
└── web/          # Next.js documentation site
    ├── app/      # App router pages
    ├── content/  # MDX documentation content
    └── components/ # React components

internal/         # Shared internal packages
├── config/       # Configuration management
└── frontend/     # Frontend-specific utilities

scripts/          # Build and deployment scripts
```

### Key Architecture Patterns

**CLI Command Structure**: Commands are organized by team role (frontend, backend, devops, design). For example:
- `radas fe gen-api` - Frontend team API generation
- `radas fe dev` - Frontend development server
- `radas be init` - Backend project initialization

**Code Generation Pipeline**:
1. OpenAPI specification parsing (`internal/frontend/parser/openapi.go`)
2. Code generation using templates (`internal/frontend/generator/`)
3. Output of TypeScript clients with React Query, Zod schemas, and Zustand stores

**Documentation Site**: Uses Fumadocs for MDX-based documentation with automatic sidebar generation from file structure.

## Common Development Commands

### CLI Development (Go)

```bash
# Build CLI for current platform
cd apps/cli
make build

# Build for all platforms
make build-all

# Run tests
go test ./...

# Run specific test file
go test ./cmd/frontend/build_test.go

# Install locally
make install

# Run without installing
go run . [command]
```

### Documentation Site (Next.js)

```bash
# Install dependencies
pnpm install

# Start development server
cd apps/web
pnpm dev

# Build for production
pnpm build

# Build for Cloudflare Pages
pnpm pages:build
```

### Monorepo Management

```bash
# Install all dependencies
pnpm install

# Format/Lint code (uses Biome)
biome check .
biome format .
```

## Key Implementation Details

### API Client Generation

The CLI's primary feature is generating TypeScript API clients from OpenAPI specs. The generation process:

1. **Validation**: OpenAPI spec is validated using `github.com/getkin/kin-openapi`
2. **Parsing**: Extracts endpoints, schemas, and types from the specification
3. **Template Rendering**: Generates multiple output files:
   - Zodios client with axios integration
   - React Query hooks for data fetching
   - Zustand stores for state management
   - Zod schemas for runtime validation

**Important**: The generator preserves exact operation ID casing from OpenAPI specs and follows specific naming conventions (e.g., GET methods prefixed with "fetch").

Configuration flags for generation:
- `--spec`: Input OpenAPI specification file (default: `./merged-api.json`)
- `--output`: Output directory (default: `./src/__generated__/api`)
- `--base-url`: Base URL for API
- `--skip-validation`: Skip OpenAPI validation
- `--all`: Generate all client types (default: true)
- Individual flags: `--zodios`, `--hooks`, `--stores`

### CLI Command System

The CLI uses Cobra for command management with Viper for configuration. Commands are organized hierarchically:

```
root
├── fe (frontend)
│   ├── gen-api
│   ├── gen-styles
│   ├── dev
│   ├── build
│   └── ...
├── be (backend)
├── devops
└── design
```

Each command group has its own subdirectory under `apps/cli/cmd/` with individual command files.

### Documentation Site Architecture

Built with:
- **Next.js 15** with App Router
- **Fumadocs** for documentation generation from MDX
- **Biome** for linting/formatting (not ESLint/Prettier)
- **Tailwind CSS v4** for styling

The site auto-generates navigation from the MDX file structure in `apps/web/content/docs/`. Blog posts and changelogs are separate collections defined in `source.config.ts`.

## Code Style and Conventions

### Go Code

- Standard Go formatting (use `go fmt`)
- Error handling: Always return errors up the call stack
- Package organization: Internal packages for implementation, cmd for CLI commands
- Use Cobra for command definitions and Viper for configuration management

### TypeScript/React

- **Biome** is used for formatting and linting (NOT ESLint or Prettier)
- Biome config is in `biome.json`:
  - Indent: 2 spaces for JS/TS, 4 for JSON
  - Single quotes for JS, double quotes for JSX
  - Semicolons: as needed
  - Line width: 100 characters
- Use TypeScript for all new files
- Prefer functional components with hooks

### File Naming

- Go: snake_case (e.g., `gen_api.go`)
- TypeScript: kebab-case or PascalCase for components (e.g., `api-client.ts`, `Button.tsx`)

## Testing

### CLI Tests

Go tests are co-located with implementation:
```bash
# Run all tests
go test ./...

# Run specific package tests
go test ./cmd/frontend/...

# Run with verbose output
go test -v ./...
```

### Web Tests

No automated tests currently configured for the web application.

## Build and Deployment

### CLI Distribution

The CLI is distributed via:
- Direct Go install: `go install github.com/Treon-Studio/radas/apps/radas-cli@latest`
- Install script: `curl -fsSL https://raw.githubusercontent.com/Treon-Studio/radas/main/apps/radas-cli/install.sh | bash`
- Platform binaries: Built via `scripts/build.sh` for multiple platforms

### Documentation Site

Deployed to Cloudflare Pages:
```bash
cd apps/web
pnpm pages:build
```

The site is configured for Cloudflare's edge runtime with specific server external packages listed in `next.config.mjs`.

## Important Notes

- **Monorepo**: Use pnpm for package management, not npm or yarn
- **Go Version**: Requires Go 1.24.0 or higher
- **Git Branch**: Main branch is `main`
- **License**: Apache 2.0
- **TypeScript Build Errors**: Currently ignored in Next.js config (`ignoreBuildErrors: true`)
