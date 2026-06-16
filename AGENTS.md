# RADAS Specialized Agents

This file documents the specialized agents and their roles within the RADAS monorepo.

## Project Agents

### CLI Specialist
- **Role:** Handles Go-based CLI development, maintenance, and testing.
- **Focus:** `apps/cli/`, internal Go packages, and CLI command implementations.
- **Conventions:** TDD, Clean Architecture, Cobra/Viper patterns.

### Backend Specialist
- **Role:** Manages business logic and shared backend modules.
- **Focus:** `modules/`, `packages/validation/`, and core services.
- **Conventions:** TypeScript, Zod validation, Modular architecture.

### Frontend Specialist
- **Role:** Designs and builds user interfaces across platforms.
- **Focus:** `apps/web/`, `apps/dashboard/`, `apps/extension/`, and `packages/ui/`.
- **Conventions:** React, Next.js, Tailwind CSS, Design System adherence.

## Agent Workflows

- **Research Phase:** Use `graphify` to understand dependencies and alur logic.
- **Implementation:** Follow the **Research -> Strategy -> Execution** cycle.
- **Validation:** Mandatory unit and integration tests before completion.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
