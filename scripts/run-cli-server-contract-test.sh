#!/usr/bin/env bash
# CLI/server contract test driver (Task 3.4 of
# docs/superpowers/plans/2026-08-27-radas-console-cli-full-integration.md).
#
# Two modes:
#
#   (a) Server half (always): the Phoenix ExUnit suite runs against a
#       reachable PostgreSQL at TEST_DATABASE_URL (default
#       postgresql://localhost/radas_test) and nothing else — no live
#       server, no Docker, no cloud credentials. The Flask-era pytest
#       reference was retired with the Phase 8 cutover.
#
#   (b) Full CLI↔server mode (only when RUN_FULL_CONTRACT=1): runs the
#       env-gated Go contract test apps/cli/internal/integration/
#       server_contract_test.go against a RUNNING server. The script starts
#       nothing itself; the caller points the RADAS_TEST_* variables at an
#       already-running control plane:
#
#         RADAS_TEST_API_URL         e.g. http://127.0.0.1:5001
#         RADAS_TEST_USERNAME        login username (no MFA)
#         RADAS_TEST_PASSWORD        login password
#         RADAS_TEST_PROJECT_NAME    project name to select (must exist and
#                                    belong to the user's org)
#         RADAS_TEST_CATALOG_SLUG    optional; enables the idempotent-mutation
#                                    assertions. Point it at a harmless,
#                                    non-production catalog definition (e.g.
#                                    the mock "exec-demo" definition used by
#                                    the server's own tests). Queued deploys
#                                    stay queued unless a worker claims them.
#         RADAS_TEST_CATALOG_VERSION optional; defaults to 1.0.0
#
#       Server requirements for mode (b): INTERNAL_CALL_SECRET (or
#       IDEMPOTENCY_FINGERPRINT_SECRET) must be configured — the DB-level
#       idempotency fingerprinting refuses to run without it — and JWT secret
#       material must be set up as for any other boot.
#
# Determinism: mode (a) resets its schema per test; mode (b) uses a unique
# service name and idempotency key per run, so repeated runs never collide.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT/apps/server"
CLI_DIR="$ROOT/apps/cli"

echo "==> [mode a] server contract (Phoenix ExUnit + PostgreSQL)"
if [[ ! -f "$SERVER_DIR/mix.exs" ]]; then
    echo "error: $SERVER_DIR/mix.exs not found." >&2
    exit 1
fi
cd "$SERVER_DIR"
mix deps.get
mix test

if [[ "${RUN_FULL_CONTRACT:-0}" != "1" ]]; then
    echo "==> mode (b) skipped (set RUN_FULL_CONTRACT=1 and the RADAS_TEST_* variables to run it)"
    exit 0
fi

echo "==> [mode b] full CLI<->server contract (go test against a live server)"
for var in RADAS_TEST_API_URL RADAS_TEST_USERNAME RADAS_TEST_PASSWORD RADAS_TEST_PROJECT_NAME; do
    if [[ -z "${!var:-}" ]]; then
        echo "error: RUN_FULL_CONTRACT=1 requires $var (see the header of this script)." >&2
        exit 1
    fi
done
cd "$CLI_DIR"
go test ./internal/integration/... -count=1
