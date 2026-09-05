# Post-Cutover Production Readiness

## Scope

Phoenix is the sole RADAS API backend. This runbook verifies deployment
correctness without using production data. The canonical tree is:

- `apps/server` — Phoenix API and Ecto migrations
- `apps/worker` — Go execution worker
- `apps/console` — web console
- `templates/opensible-iac` — tracked IaC source

## Probes

`/api/healthz` is **liveness**. It only proves that the Phoenix process can
serve HTTP and intentionally remains independent of PostgreSQL.

`/api/readyz` is **readiness**. It checks PostgreSQL connectivity, both
migration ledgers (`schema_migrations` versions 1–30 and Ecto's
`ecto_migrations`), and required runtime configuration. It returns a platform
success envelope with HTTP 200 when ready, or a safe platform error envelope
with HTTP 503 when not ready. It never returns a DSN or secret value.

## Local verification

Start PostgreSQL and create a disposable database, then run:

```bash
cd apps/server
mix deps.get
DATABASE_URL=postgresql://localhost/radas_test MIX_ENV=test mix ecto.create
DATABASE_URL=postgresql://localhost/radas_test MIX_ENV=test mix ecto.migrate
JWT_SECRET_KEY=local-readiness-jwt INTERNAL_CALL_SECRET=local-readiness-internal GLOBAL_SECRETS_ENCRYPTION_KEY=local-readiness-encryption mix test
```

For a running local server, execute:

```bash
RADAS_SMOKE_BASE_URL=http://127.0.0.1:4000 bash scripts/post-cutover-smoke.sh
```

The smoke script requires liveness, readiness, and the platform contract. A
router origin and dedicated smoke account are optional and must be explicitly
provided; skipped optional legs are printed as `SKIP`, never reported as pass.

## Database recovery drill

Use only two disposable databases. The script is fail-closed and requires an
explicit URL for both databases plus `DRILL_CONFIRM=1`:

```bash
DRILL_CONFIRM=1 \
DRILL_DATABASE_URL=postgresql://drill:drill@localhost/radas_drill \
DRILL_RESTORE_DATABASE_URL=postgresql://drill:drill@localhost/radas_drill_restore \
bash scripts/db-recovery-drill.sh
```

It seeds non-production sentinel rows, validates JSONB, bytea, foreign keys,
the audit sequence, and both migration ledgers, creates and validates a
`pg_dump` custom archive, restores into the second database, and verifies that
a deliberately truncated archive is rejected. It prints only a checksum and
duration; the archive and all temporary files are deleted on exit.

Never set either drill URL to `DATABASE_URL`, `TEST_DATABASE_URL`, a production
hostname, Neon, Supabase, or the public API domain. Database dumps include
encrypted credentials and must not be uploaded to CI artifacts.

## VPS prerequisites and deployment

The VPS must have Elixir/OTP matching the application, Hex, PostgreSQL client
access, Go, PM2, rsync, and the required values in `/opt/radas/.env`:

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `INTERNAL_CALL_SECRET`
- `GLOBAL_SECRETS_ENCRYPTION_KEY`
- `WORKER_REGISTRATION_SECRET`
- `VAULT_SERVER_SECRET`
- `PREVIEW_WEBHOOK_SECRET`

The deploy workflow runs Ecto migrations, compiles Phoenix, stages the tracked
IaC tree, restarts `radas-phoenix` and `radas-worker`, checks both PM2 processes,
and runs `/api/healthz`, `/api/readyz`, and the contract smoke on localhost.
It does not rewrite application secrets or CORS values.

Before a production deployment, record the current Git SHA and image tags. A
manual rollback is:

1. Stop the deployment and preserve PM2 logs.
2. Check out the recorded previous SHA (or repin the previous immutable image).
3. Restore the compatible application image/source and restart Phoenix/worker.
4. Run `/api/healthz`, `/api/readyz`, and the contract smoke.
5. Restore the database only when the migration compatibility policy says the
   previous application cannot safely read the current schema.
6. Record the failed SHA, rollback duration, and resulting health status.

Automatic rollback is intentionally not enabled until this sequence is tested
against staging.

## Worker recovery verification

The in-process worker protocol tests cover registration, token persistence,
heartbeat, system-info, and invalid-token behavior. A staging deployment must
additionally verify that the running worker process is online in PM2 and can
register/heartbeat against the deployed Phoenix API using a disposable worker
identity. Do not use a production worker token in a smoke test.

## RPO/RTO evidence

For each staging drill record:

```text
backup_started_at:
backup_finished_at:
dump_size_bytes:
restore_started_at:
restore_finished_at:
restore_duration_seconds:
application_recovery_seconds:
RPO target / observed:
RTO target / observed:
```

## Protected workflow

`.github/workflows/post-cutover-readiness.yml` is manual-only. Its staging
HTTP smoke and database drill jobs are opt-in inputs and use the protected
`staging` environment. The default Phoenix job uses a disposable PostgreSQL
service and runs script syntax validation plus the Phoenix suite. It never
falls back to production credentials.

## Evidence and current status

### Verified evidence

| Check | Evidence | Result |
|---|---|---|
| Phoenix suite | `post-cutover-readiness` run `33943444104`, job `101245104188` (and rerun `33944362571`, job `101247665492`) | 353 tests, 0 failures |
| Database recovery | Same workflow, job `101245104305` | restore completed; `restore_seconds=1`; JSONB, bytea, ledger, sequence, and corrupted-archive checks passed |
| Local HTTP smoke | `post-cutover-smoke.sh` against `127.0.0.1:4000` | liveness, readiness, platform envelope, redaction, 404, legacy shape, and CORS passed |
| Required repository CI | PR #81 checks | Phoenix, console, Go, and cross-client checks passed |

The database drill's measured result is an observed local/CI recovery time, not
a production RTO guarantee. The run did not publish the dump or raw response
bodies. Its source and restore databases were disposable PostgreSQL service
instances.

### Blocked operational evidence

The following items are intentionally **not marked passed**:

- Protected staging HTTP smoke: explicitly attempted in readiness run
  `33944362571`, job `101247665584`, and failed closed because
  `RADAS_SMOKE_BASE_URL`, `RADAS_SMOKE_ROUTER_URL`, `RADAS_SMOKE_USERNAME`, and
  `RADAS_SMOKE_PASSWORD` are unset in the `staging` environment. The workflow
  correctly made no HTTP request with empty credentials.
- Public API smoke: `https://api-radas.treonstudio.com/api/healthz` returned
  Cloudflare HTTP 530 during the audit. The public origin is unavailable at
  the edge; this is not evidence of a Phoenix response.
- Worker register/heartbeat against a deployed VPS: no disposable staging
  worker identity was available, and Deploy VPS run `33944261210` failed
  before the remote script began with an SSH connection timeout. No worker
  token was created and no production worker was touched.
- Staging rollback and soak: no staging deployment/image and no rollback drill
  execution is available yet. The manual rollback procedure above remains a
  runbook, not evidence of a completed drill.

These gaps must be resolved by configuring a protected staging environment and
running the optional workflow jobs. Do not infer them from in-process ExUnit
coverage or the PM2 commands in the workflow.

Cloudflare Pages checks are controlled by Cloudflare project configuration,
including GitHub Packages authentication and deployment secrets. A failing
Cloudflare dashboard check is not evidence that the Phoenix API or repository
workflow is broken; it must be resolved in the Cloudflare project environment.
