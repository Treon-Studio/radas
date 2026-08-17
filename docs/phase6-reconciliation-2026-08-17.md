# Legacy Phase 6 reconciliation — 2026-08-17

This report classifies Phase 6 against the current working tree and focused tests. It does not claim the entire backlog is complete.

## Evidence-backed implemented batches

- Feature flags: scoped registry, audit/TTL, rollback, impact/dependents, import/export, default seeding.
- Test cases: CRUD, assertions, batch/scheduled execution, bounded timeout, JSON result export.
- GitHub Actions: workflow state, run detail/jobs/logs, runner listing, dispatch/rerun/cancel, templates/scaffold.
- BYOC: encrypted credentials, provider detection, validation notifications, inventory/import validation, health checks, rotation.
- All-in-One platform Phase 0–5: service catalog, runtime/plan/apply contracts, environments, source, pipelines, observability, usage/billing boundary, change requests, catalog metadata.

## Partial or still missing

The roadmap contains 492 `🔶`/`⬜` markers, including duplicate or stale rows. Remaining substantive work includes:

- GitHub deployment protection, required checks, workflow webhooks, runner lifecycle, rate-limit/backoff, multi-connection support.
- Test-case provider-image/budget/instance assertions, checkov/tfsec, full drift/Ansible execution, retry/concurrency/baselines/notifications.
- BYOC managed-resource tracking, drift/release, inventory snapshots, account policy, cost/billing integration, and advanced import UX.
- Competitor parity, cross-cutting UX/accessibility/pagination/rate limits, registry versioning/dependencies/remote adoption.

Rows with duplicate capabilities should be reconciled to `✅` only after matching focused test evidence; rows with only primitives remain `🔶`.

## Verification commands

```text
apps/opensible-server/.venv/bin/pytest tests/ -q
apps/opensible-server/.venv/bin/python -m compileall -q api services storage
pnpm --filter @radas/console typecheck
pnpm --filter @radas/console build
pnpm test:e2e
 git diff --check
```

The mutation boundary now invokes the fail-closed `services.flag_gate.mutation_blocked` helper before cloud stack mutation. Any flag-evaluation error refuses the operation.
