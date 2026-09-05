#!/usr/bin/env bash
# Cross-client contract parity driver (Task 6.2 of
# docs/superpowers/plans/2026-08-27-radas-console-cli-full-integration.md).
#
# One gate for the shared "login -> projects read -> services read ->
# idempotent deploy mutation -> replay/conflict" contract across all three
# client legs:
#
#   * server reference (ExUnit):   apps/server/test — the Phoenix suite
#                                  is the behavioral contract reference
#                                  (Phase 8: the Flask reference was retired)
#   * TypeScript console client:   apps/console/src/test/cross-client-fixtures.test.ts
#     (always-on fixture leg + env-gated real-HTTP leg)
#   * Go client + direct HTTP:     apps/cli/internal/integration/cross_client_test.go
#
# The contract itself is recorded in contracts/cross-client-fixtures.json,
# populated from the server reference half.
#
# Modes:
#
#   (a) Default (always on): the offline-safe gate —
#         1. [server]  ExUnit reference contract (the Phoenix suite covers the
#                      login/projects/services/execution flows and the
#                      ontology parity gate; requires a running PostgreSQL —
#                      the CI job provisions a postgres:16 service container)
#         2. [console] typecheck + full vitest run (the fixture leg asserts the
#                      console client against the contract; the real-HTTP leg
#                      skips) + production build
#         3. [cli]     go vet + go test (the env-gated integration tests skip
#                      cleanly without a live server)
#         4. [worker]  go test
#
#   (b) Full cross-client mode (only when RUN_FULL_CONTRACT=1): adds the
#       live-server legs against an ALREADY-RUNNING control plane. The script
#       starts nothing itself. Configure the RADAS_TEST_* variables exactly as
#       for scripts/run-cli-server-contract-test.sh:
#
#         RADAS_TEST_API_URL         e.g. http://127.0.0.1:5001
#         RADAS_TEST_USERNAME        login username (no MFA)
#         RADAS_TEST_PASSWORD        login password
#         RADAS_TEST_PROJECT_NAME    project name to select (must exist and
#                                    belong to the user's org)
#         RADAS_TEST_CATALOG_SLUG    optional; enables the idempotent-mutation
#                                    assertions. Point it at a harmless,
#                                    non-production catalog definition. Queued
#                                    deploys stay queued unless a worker claims
#                                    them.
#         RADAS_TEST_CATALOG_VERSION optional; defaults to 1.0.0
#
#       The TypeScript real-HTTP leg reuses the same values: VITEST_CROSS_*
#       variables are derived from RADAS_TEST_* unless explicitly set.
#
#       Server requirements for mode (b) are the same as for the Task 3.4
#       contract test: INTERNAL_CALL_SECRET (or
#       IDEMPOTENCY_FINGERPRINT_SECRET) must be configured — the DB-level
#       idempotency fingerprinting refuses to run without it — plus the usual
#       JWT secret material.
#
# Failures are labeled with the gate domain ([server]/[console]/[cli]/[worker])
# and, inside the tests themselves, with client=/domain=/endpoint= labels.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT/apps/server"
CONSOLE_DIR="$ROOT/apps/console"
CLI_DIR="$ROOT/apps/cli"
WORKER_DIR="$ROOT/apps/worker"

fail() {
    echo "error: [cross-client-contracts] $*" >&2
    exit 1
}

if [[ ! -f "$ROOT/contracts/cross-client-fixtures.json" ]]; then
    fail "contracts/cross-client-fixtures.json is missing (it is the shared contract source)"
fi

# --- gate 1: [server] ExUnit reference contract ------------------------------
echo "==> [server] cross-client reference contract (ExUnit, Phoenix suite)"
if [[ ! -f "$SERVER_DIR/mix.exs" ]]; then
    echo "error: [server] $SERVER_DIR/mix.exs not found." >&2
    exit 1
fi
cd "$SERVER_DIR"
# Gate 1 runs the full Phoenix suite, which includes the ontology parity gate
# (RadasOntologyParityTest) and the CLI route-parity gate
# (RadasCliRouteParityTest) against contracts/domain-ontology.json and
# contracts/cli-route-manifest.json (see docs/architecture/domain-ontology.md).
if [[ ! -d "$SERVER_DIR/deps/phoenix" ]]; then
    echo "    [server] hex deps missing; running mix deps.get"
    mix deps.get
fi
mix test

# --- gate 2: [console] typecheck + vitest + build ---------------------------
echo "==> [console] contract fixtures test + typecheck + build"
cd "$CONSOLE_DIR"
if [[ ! -d node_modules ]]; then
    echo "    [console] node_modules missing; running pnpm install --frozen-lockfile"
    pnpm install --frozen-lockfile
fi
pnpm typecheck
pnpm test
pnpm build

# --- gate 3: [cli] go vet + tests (env-gated tests skip cleanly) ------------
echo "==> [cli] go vet + go test (live-server contract tests skip unless configured)"
cd "$CLI_DIR"
go vet ./...
# Unset DB env vars so the CLI's DSN() unit tests (TestDSN/no_env) see a clean
# environment — the cross-client job sets DATABASE_URL for the server ExUnit
# leg, and Go's os.Getenv reads it directly.
env -u DATABASE_URL -u DB_URL -u SUPABASE_DB_URL go test ./...

# --- gate 4: [worker] go test -----------------------------------------------
echo "==> [worker] go test"
if [[ -d "$WORKER_DIR" ]]; then
    cd "$WORKER_DIR"
    go test ./...
else
    echo "    [worker] apps/worker not present; skipped"
fi

if [[ "${RUN_FULL_CONTRACT:-0}" != "1" ]]; then
    echo "==> mode (b) skipped (set RUN_FULL_CONTRACT=1 and the RADAS_TEST_* variables to run the live-server legs)"
    exit 0
fi

# --- mode b: live-server legs (Go client + direct HTTP, TypeScript client) --
echo "==> [mode b] full cross-client contract against a live server"
for var in RADAS_TEST_API_URL RADAS_TEST_USERNAME RADAS_TEST_PASSWORD RADAS_TEST_PROJECT_NAME; do
    if [[ -z "${!var:-}" ]]; then
        fail "RUN_FULL_CONTRACT=1 requires $var (see the header of this script)"
    fi
done

# The TypeScript real-HTTP leg reuses the RADAS_TEST_* values unless the
# VITEST_CROSS_* variables were set explicitly.
export VITEST_CROSS_CLIENT_URL="${VITEST_CROSS_CLIENT_URL:-$RADAS_TEST_API_URL}"
export VITEST_CROSS_CLIENT_USERNAME="${VITEST_CROSS_CLIENT_USERNAME:-$RADAS_TEST_USERNAME}"
export VITEST_CROSS_CLIENT_PASSWORD="${VITEST_CROSS_CLIENT_PASSWORD:-$RADAS_TEST_PASSWORD}"
export VITEST_CROSS_CLIENT_PROJECT_NAME="${VITEST_CROSS_CLIENT_PROJECT_NAME:-$RADAS_TEST_PROJECT_NAME}"
export VITEST_CROSS_CLIENT_CATALOG_SLUG="${VITEST_CROSS_CLIENT_CATALOG_SLUG:-$RADAS_TEST_CATALOG_SLUG}"
export VITEST_CROSS_CLIENT_CATALOG_VERSION="${VITEST_CROSS_CLIENT_CATALOG_VERSION:-$RADAS_TEST_CATALOG_VERSION}"

echo "==> [mode b][cli] Go client + direct-HTTP legs (go test)"
cd "$CLI_DIR"
go test ./internal/integration/... -count=1 -v

echo "==> [mode b][console] TypeScript real-HTTP leg (vitest)"
cd "$CONSOLE_DIR"
pnpm vitest run src/test/cross-client-fixtures.test.ts

echo "==> cross-client contract parity: all gates passed"
