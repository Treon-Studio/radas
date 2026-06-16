# RADAS Specialized Agents

This file documents the specialized agents and their roles within the RADAS monorepo.

<agent_definitions>
  <agent name="CLI Specialist">
    <role>Handles Go-based CLI development, maintenance, and testing.</role>
    <focus>apps/cli/, internal Go packages, and CLI command implementations.</focus>
    <conventions>TDD, Clean Architecture, Cobra/Viper patterns.</conventions>
  </agent>

  <agent name="Backend Specialist">
    <role>Manages business logic and shared backend modules.</role>
    <focus>modules/, packages/validation/, and core services.</focus>
    <conventions>TypeScript, Zod validation, Modular architecture.</conventions>
  </agent>

  <agent name="Frontend Specialist">
    <role>Designs and builds user interfaces across platforms.</role>
    <focus>apps/web/, apps/dashboard/, apps/extension/, and packages/ui/.</focus>
    <conventions>React, Next.js, Tailwind CSS, Design System adherence.</conventions>
  </agent>
</agent_definitions>

<automation_hooks>
  <hook name="Knowledge Graph Sync" type="post-merge">
    <location>.git/hooks/post-merge</location>
    <action>Automatically triggers `graphify update .` after every `git pull` or `git merge`.</action>
    <purpose>Ensures the local knowledge graph stays synchronized with code changes from other contributors.</purpose>
  </hook>
</automation_hooks>

<security_policies>
  <policy name="Vulnerability Scanning">
    <tool>scripts/vulnerability-scan.sh</tool>
    <purpose>Checks for security vulnerabilities in both Go (CLI) and JS/TS (Modules/Packages) dependencies.</purpose>
    <usage>Run `./scripts/vulnerability-scan.sh` manually before pushing code.</usage>
    <rules>
      <rule lang="Go">Uses `govulncheck` to identify known vulnerabilities in standard library and third-party packages.</rule>
      <rule lang="JS/TS">Uses `pnpm audit` with a focus on High and Critical severity issues.</rule>
    </rules>
  </policy>
</security_policies>

<workflows>
  <workflow name="Development Lifecycle">
    <step stage="Research">Use `graphify` to understand dependencies and logic flow.</step>
    <step stage="Implementation">Follow the Research -> Strategy -> Execution cycle.</step>
    <step stage="Validation">Mandatory unit and integration tests before completion.</step>
  </workflow>
</workflows>

<graphify_instructions>
  <context>This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships.</context>
  <rules>
    <rule>ALWAYS read `graphify-out/GRAPH_REPORT.md` before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.</rule>
    <rule>IF `graphify-out/wiki/index.md` EXISTS, navigate it instead of reading raw files.</rule>
    <rule>For cross-module "how does X relate to Y" questions, prefer `graphify query`, `graphify path`, or `graphify explain` over grep.</rule>
    <rule>After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).</rule>
  </rules>
</graphify_instructions>
