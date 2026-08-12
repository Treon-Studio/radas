# PostgreSQL / Neon migration (Fase 7)

Radas server sekarang **selalu memakai PostgreSQL** — SQLite dan JSON-file
storage telah dimigrasikan ke Postgres (Neon supported). `DATABASE_URL`
wajib; server menolak boot tanpa koneksi yang bisa diakses.

## Arsitektur storage (sekarang)

| Layer | Sebelum | Sekarang |
|---|---|---|
| Auth/RBAC/sessions/audit | SQLite `auth/auth.db` | tabel `users/roles/permissions/…` di PG |
| Projects/settings | SQLite `config.db` | `projects` (kolom org_id/owner_id), `settings` |
| Worker index (queue/running/token) | SQLite `index.db` | `queued_executions/running_executions/execution_locations/worker_tokens` |
| Config-store (flags, quotas, budgets, byoc, automation, webhooks, test_cases, …) | `*.json` di DATA_DIR | `kv_store(scope, key, value jsonb)` |
| Executions + logs | `projects/<pid>/history/*.json|.log` | `executions(jsonb)` + `execution_logs(bytea)` |
| Stack meta/secrets/snapshots | `.cloud-provisioning/<stack>/*.json` | `stack_meta/jsonb`, `stack_secrets/bytea`, `snapshots/bytea` |
| Cost estimates/reports, CI/CD pipelines/runs, playbook definitions/schedules | JSON files | `kv_store` scoped per project |
| Repo playbooks (YAML), artifacts, IaC workspace files | filesystem | tetap filesystem (sumber Git / binary) |

Skema dikelola `storage/pg_schema.py` (versioned via `schema_migrations`;
saat ini v1 + v2 — v2 memperbaiki presisi timestamp REAL→DOUBLE PRECISION).

## Setup Neon (prod) / Postgres lokal (dev)

### Neon
1. Buat project di https://console.neon.tech → dapatkan connection string
   `postgres://user:pass@ep-….neon.tech/neondb?sslmode=require`.
2. Set env server:

```bash
DATABASE_URL=postgres://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
```

### Postgres lokal (dev)
```bash
brew install postgresql@15 && brew services start postgresql@15
createdb radas && createdb radas_test
# DATABASE_URL default di ecosystem.config.cjs sudah menunjuk ke sini
```

## Menjalankan

```bash
# schema dibuat otomatis saat boot (pg_schema.migrate())
cd apps/opensible-server
DATABASE_URL=postgresql://localhost/radas .venv/bin/python app.py
```

## Migrasi data lama (satu arah, sekali)

Backup `data/` dulu, lalu:

```bash
cd apps/opensible-server
DATABASE_URL=postgres://… .venv/bin/python scripts/migrate_legacy.py --data-dir data
```

Membaca SQLite lama (`auth.db`, `config.db`) + JSON stores + stack files dan
mengisinya ke PG. Idempotent (skip bila sudah terisi; `--force` untuk ulang).

## Testing

```bash
cd apps/opensible-server
# test memakai TEST_DATABASE_URL (default postgresql://localhost/radas_test);
# schema di-reset per test.
.venv/bin/python -m pytest tests/ -q
```

## Multi-tenant (Fase D)

- `orgs` + `org_members(user, role)` — role: owner/admin/member/readonly.
- `projects.org_id` + `owner_id`; project list difilter per org user.
- JWT memuat `org_id`; `POST /api/auth/switch-org` mengganti token.
- `require_project_access` di route cloud/stack/secrets/data/vaults/… → 403
  bila user bukan anggota org pemilik project (menutup celah traversal
  `X-Project-Id`).
- Console: dropdown org di header + halaman `/settings/orgs`.

## Rollback

Tidak ada rollback otomatis ke SQLite — data lama tetap di backup `data/`
sebelum migrasi. Git history berisi kode pra-Postgres.
