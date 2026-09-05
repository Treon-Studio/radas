#!/usr/bin/env bash
# Disposable PostgreSQL migration and logical backup/restore drill.
# This script is deliberately opt-in: it never falls back to DATABASE_URL.
set -euo pipefail

: "${DRILL_CONFIRM:?Set DRILL_CONFIRM=1 for a disposable database only}"
[[ "$DRILL_CONFIRM" == "1" ]] || { echo 'DRILL_CONFIRM must equal 1' >&2; exit 1; }
: "${DRILL_DATABASE_URL:?Set DRILL_DATABASE_URL explicitly}"
: "${DRILL_RESTORE_DATABASE_URL:?Set DRILL_RESTORE_DATABASE_URL explicitly}"

for url in "$DRILL_DATABASE_URL" "$DRILL_RESTORE_DATABASE_URL"; do
  case "$url" in
    *prod*|*production*|*neon.tech*|*api-radas*|*supabase.co*)
      echo 'Refusing production-like drill database URL' >&2; exit 1 ;;
  esac
done
[[ "$DRILL_DATABASE_URL" != "${DATABASE_URL:-}" && "$DRILL_DATABASE_URL" != "${TEST_DATABASE_URL:-}" ]] || {
  echo 'DRILL_DATABASE_URL must be explicit and different from DATABASE_URL/TEST_DATABASE_URL' >&2; exit 1;
}
command -v psql >/dev/null || { echo 'psql is required' >&2; exit 1; }
command -v pg_dump >/dev/null || { echo 'pg_dump is required' >&2; exit 1; }
command -v pg_restore >/dev/null || { echo 'pg_restore is required' >&2; exit 1; }

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/radas-db-drill.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
DUMP="$TMP_DIR/radas.dump"
FIXTURE="$TMP_DIR/fixture.sql"

cat >"$FIXTURE" <<'SQL'
BEGIN;
INSERT INTO orgs (id, name, created_by, created_at)
VALUES ('drill-org', 'Recovery Drill Org', 'drill-user', extract(epoch from clock_timestamp()))
ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, username, email, password_hash)
VALUES ('drill-user', 'recovery-drill', 'recovery-drill@example.invalid', 'not-a-login-hash')
ON CONFLICT (id) DO NOTHING;
INSERT INTO org_members (org_id, user_id, role, created_at)
VALUES ('drill-org', 'drill-user', 'owner', extract(epoch from clock_timestamp()))
ON CONFLICT (org_id, user_id) DO NOTHING;
INSERT INTO projects (id, org_id, owner_id, name, created_at)
VALUES ('drill-project', 'drill-org', 'drill-user', 'Recovery Drill', extract(epoch from clock_timestamp()))
ON CONFLICT (id) DO NOTHING;
INSERT INTO executions (id, project_id, data, created_at)
VALUES ('drill-execution', 'drill-project', '{"sentinel":"recovery-drill","n":7}'::jsonb, extract(epoch from clock_timestamp()))
ON CONFLICT (id) DO NOTHING;
INSERT INTO execution_logs (execution_id, chunk, data)
VALUES ('drill-execution', 0, decode('7265636f766572792d6472696c6c','hex'))
ON CONFLICT (execution_id, chunk) DO NOTHING;
INSERT INTO stack_meta (project_id, stack, data)
VALUES ('drill-project', 'drill-stack', '{"sentinel":"recovery-drill"}'::jsonb)
ON CONFLICT (project_id, stack) DO NOTHING;
INSERT INTO stack_state (project_id, stack, data, raw)
VALUES ('drill-project', 'drill-stack', '{"serial":7}'::jsonb, decode('73746174652d73656e74696e656c','hex'))
ON CONFLICT (project_id, stack) DO NOTHING;
INSERT INTO org_ai_routes (id, org_id, alias_name, primary_model, fallback_models, created_at)
VALUES ('drill-route', 'drill-org', 'recovery-drill', 'drill-model', '["fallback-model"]'::jsonb, extract(epoch from clock_timestamp()))
ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_log (actor_user_id, action, target_type, target_id, meta_json, created_at)
VALUES ('drill-user', 'recovery.drill', 'drill', 'drill-project', '{"sentinel":"recovery-drill"}', extract(epoch from clock_timestamp()));
COMMIT;
SQL

psql "$DRILL_DATABASE_URL" --set=ON_ERROR_STOP=1 -f "$FIXTURE" >/dev/null
psql "$DRILL_DATABASE_URL" --set=ON_ERROR_STOP=1 -Atc "
  SELECT 'preflight', count(*) FROM projects WHERE id='drill-project';
  SELECT 'jsonb', (data->>'sentinel') FROM executions WHERE id='drill-execution';
  SELECT 'bytea', encode(data, 'hex') FROM execution_logs WHERE execution_id='drill-execution' AND chunk=0;
  SELECT 'ledger', count(*) FROM schema_migrations WHERE version BETWEEN 1 AND 30;
  SELECT 'ecto', count(*) FROM ecto_migrations;
" | tee "$TMP_DIR/preflight.txt"
grep -q '^preflight|1$' "$TMP_DIR/preflight.txt"
grep -q '^jsonb|recovery-drill$' "$TMP_DIR/preflight.txt"
grep -q '^bytea|7265636f766572792d6472696c6c$' "$TMP_DIR/preflight.txt"
grep -q '^ledger|30$' "$TMP_DIR/preflight.txt"

START="$(date +%s)"
pg_dump --format=custom --no-owner --file="$DUMP" "$DRILL_DATABASE_URL" >/dev/null
[[ -s "$DUMP" ]] || { echo 'pg_dump produced an empty file' >&2; exit 1; }
shasum -a 256 "$DUMP" | cut -d' ' -f1 > "$TMP_DIR/dump.sha256"
pg_restore --list "$DUMP" >/dev/null
pg_restore --clean --if-exists --no-owner --dbname="$DRILL_RESTORE_DATABASE_URL" "$DUMP" >/dev/null
END="$(date +%s)"

psql "$DRILL_RESTORE_DATABASE_URL" --set=ON_ERROR_STOP=1 -Atc "
  SELECT 'postflight', count(*) FROM projects WHERE id='drill-project';
  SELECT 'jsonb', (data->>'sentinel') FROM executions WHERE id='drill-execution';
  SELECT 'bytea', encode(data, 'hex') FROM execution_logs WHERE execution_id='drill-execution' AND chunk=0;
  SELECT 'ledger', count(*) FROM schema_migrations WHERE version BETWEEN 1 AND 30;
  SELECT 'ecto', count(*) FROM ecto_migrations;
  SELECT 'sequence', (SELECT last_value FROM audit_log_id_seq) >= (SELECT max(id) FROM audit_log);
" | tee "$TMP_DIR/postflight.txt"
grep -q '^postflight|1$' "$TMP_DIR/postflight.txt"
grep -q '^jsonb|recovery-drill$' "$TMP_DIR/postflight.txt"
grep -q '^bytea|7265636f766572792d6472696c6c$' "$TMP_DIR/postflight.txt"
grep -q '^ledger|30$' "$TMP_DIR/postflight.txt"
grep -q '^sequence|t$' "$TMP_DIR/postflight.txt"

# Deliberately corrupt a copy and prove pg_restore rejects it.
cp "$DUMP" "$TMP_DIR/corrupt.dump"
truncate -s 64 "$TMP_DIR/corrupt.dump"
if pg_restore --list "$TMP_DIR/corrupt.dump" >/dev/null 2>&1; then
  echo 'corrupted dump unexpectedly validated' >&2
  exit 1
fi
printf 'PASS: migration/backup/restore drill (restore_seconds=%s dump_sha256=%s)\n' "$((END - START))" "$(cut -d' ' -f1 "$TMP_DIR/dump.sha256")"
