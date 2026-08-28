#!/usr/bin/env bash
# OpenAPI contract gate (Task 6.1, 2026-08-27 console-CLI integration plan).
#
# Runs every contract gate for the served /api/v2 surface and the committed
# snapshot at contracts/radas-api-v2.openapi.json:
#
#   1. byte-compile the server tree (syntax gate);
#   2. static sensitive-path rules (scripts/check_sensitive_paths.py);
#   3. pytest contract suite:
#        - tests/test_openapi_contract.py       duplicate operation IDs,
#          violations-baseline ratchet, exporter byte-stability,
#          legacy-surface pins, fail-closed v2 mount;
#        - tests/test_openapi_snapshot_served.py  served-snapshot pin: the
#          exporter mirrors the real app.py boot and byte-matches the
#          committed snapshot (drift fails with the first differing path);
#        - tests/test_route_parity.py           CLI route manifest vs
#          app.url_map (route missing from the served surface fails here).
#   4. exporter byte-compare against the committed snapshot, with the raw
#      diff printed on drift so the failure is actionable outside pytest.
#
# Exit status: 0 only when every gate passes. Deterministic and runnable
# locally without CI: blueprint mounting opens no database connection or
# network access (the readiness probes used by the contract tests are
# monkeypatched).
#
# Generated clients: none exist yet (console uses hand-written
# apps/console/src/lib/api.ts; the CLI uses apps/cli/internal/client), so
# there is no generated-client freshness check today — snapshot-vs-served
# drift is the freshness gate. When a generated client lands, add its
# regeneration + git-diff check here next to the exporter comparison.
#
# Usage:
#   bash scripts/check-openapi-contract.sh            # from anywhere
#   PYTHON=/path/to/python bash scripts/check-openapi-contract.sh
# (PYTHON defaults to apps/server/.venv/bin/python when present, else python3.)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_ROOT="$REPO_ROOT/apps/server"
SNAPSHOT="$REPO_ROOT/contracts/radas-api-v2.openapi.json"

if [[ -n "${PYTHON:-}" ]]; then
  :
elif [[ -x "$SERVER_ROOT/.venv/bin/python" ]]; then
  PYTHON="$SERVER_ROOT/.venv/bin/python"
else
  PYTHON="$(command -v python3)"
fi

echo "==> [1/4] byte-compile server tree (python: $PYTHON)"
(
  cd "$SERVER_ROOT" && "$PYTHON" -m compileall -q \
    app.py worker.py api api_v2 auth global openapi playbooks \
    registry schemas scripts services storage tests utils
)

echo "==> [2/4] static sensitive-path rules"
(
  cd "$SERVER_ROOT" && "$PYTHON" scripts/check_sensitive_paths.py
)

echo "==> [3/4] pytest contract suite"
(
  cd "$SERVER_ROOT" && "$PYTHON" -m pytest -q \
    tests/test_openapi_contract.py \
    tests/test_openapi_snapshot_served.py \
    tests/test_route_parity.py
)

echo "==> [4/4] exporter byte-compare against committed snapshot"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
(
  cd "$SERVER_ROOT" &&
    "$PYTHON" scripts/export_openapi.py --output "$TMP_DIR/served.json"
) >"$TMP_DIR/export.log"
if ! diff -u "$SNAPSHOT" "$TMP_DIR/served.json" >"$TMP_DIR/diff.txt"; then
  echo "ERROR: served /api/v2 OpenAPI document drifted from $SNAPSHOT" >&2
  echo "--- diff (snapshot -> served) ---" >&2
  cat "$TMP_DIR/diff.txt" >&2
  echo "--- exporter log ---" >&2
  cat "$TMP_DIR/export.log" >&2
  echo "If the drift is intentional, regenerate with:" >&2
  echo "  cd apps/server && .venv/bin/python scripts/export_openapi.py --output $SNAPSHOT" >&2
  echo "and commit the reviewed snapshot together with the surface change." >&2
  exit 1
fi
cat "$TMP_DIR/export.log"

echo "OK: OpenAPI contract gate passed (committed snapshot is the served document)"
