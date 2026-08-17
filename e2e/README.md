# Console Playwright smoke tests

These tests exercise the console through a real Chromium browser:

- `Project → Services → service deployment`
- `Feature Flags → create → configuration`

They are automated Playwright checks, not ZCode browser MCP/IAB evidence.

## Prerequisites

Run the Flask API and console first. The repository's normal local stack is:

```bash
pnpm dev:radas
```

The defaults are API `http://127.0.0.1:5001` and console `http://localhost:8080`.

Provide a real local test account; credentials are never stored in the repository:

```bash
export E2E_USERNAME=admin
export E2E_PASSWORD='your-local-password'
```

Optional overrides:

```bash
export E2E_BASE_URL=http://localhost:8080
export E2E_API_BASE=http://localhost:5001
```

## Install and run

```bash
pnpm install
pnpm exec playwright install chromium
pnpm test:e2e
```

List tests without running them:

```bash
pnpm exec playwright test --list
```

Screenshots are written to `test-results/`. The HTML report is written to
`playwright-report/`:

```bash
pnpm exec playwright show-report playwright-report
```

The service and feature-flag tests create real records. Use an isolated local
workspace or remove the generated `e2e-*` flag/service records after a run.
