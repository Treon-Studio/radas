#!/usr/bin/env bash
# Conformance smoke-check for the RADAS Elixir server (Elixir migration
# Phase 0.5 harness). Verifies — against a running Phoenix — the exact
# platform-contract behaviors clients depend on:
#
#   1. GET  /api/healthz                → 200 JSON with status=ok
#   2. POST /api/platform/echo          → success envelope, redacted fields,
#                                         body request_id == X-Request-ID header
#   3. GET  /api/v2/<unmatched>         → 404 error envelope (NOT_FOUND) with
#                                         request_id pairing
#   4. GET  /api/auth/<unmatched>       → legacy shape, NO request-id stamping
#   5. OPTIONS /api/* preflight         → 204 with CORS echo headers
#
# Usage:
#   bash scripts/check-server-contract.sh                       # :4000
#   RADAS_ELIXIR_BASE_URL=http://localhost:8090 bash scripts/... # via router
#
# Full cross-client fixtures (login → projects → services → replay) run once
# Phase 2 (auth) is cut over; until then this script is the per-phase gate.
set -euo pipefail

BASE_URL="${RADAS_ELIXIR_BASE_URL:-http://localhost:4000}"
failures=0

fail() {
  echo "FAIL: $1"
  failures=$((failures + 1))
}

json() {
  # json <body> <python-expr> [sent_id] — evaluate an expression against a
  # JSON body; `sent_id` is available inside the expression when given.
  python3 - "$1" "$2" "${3:-}" <<'PY'
import json, sys
body, expr = sys.argv[1], sys.argv[2]
sent_id = sys.argv[3] if len(sys.argv) > 3 else ""
try:
    doc = json.loads(body)
except Exception:
    sys.exit(1)
result = eval(expr, {"json": json}, {"doc": doc, "sent_id": sent_id})
sys.exit(0 if result else 1)
PY
}

echo "== 1. health endpoint =="
resp=$(curl -s -w '\n%{http_code}' "$BASE_URL/api/healthz")
status="${resp##*$'\n'}"
body="${resp%$'\n'*}"
[ "$status" = "200" ] || fail "health returned HTTP $status (want 200)"
json "$body" 'doc.get("status") == "ok"' || fail "health body missing status=ok"

echo "== 2. echo probe: envelope + redaction + request-id pairing =="
req_id="req-echo-$RANDOM"
resp=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/api/platform/echo" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: $req_id" \
  -d '{"name": "probe", "api_key": "sk-live-SUPERSECRET123", "token": "tok-secret"}')
status="${resp##*$'\n'}"
body="${resp%$'\n'*}"
[ "$status" = "200" ] || fail "echo returned HTTP $status (want 200)"
json "$body" 'doc.get("request_id") == sent_id' "$req_id" || fail "echo body request_id != sent X-Request-ID"
json "$body" '"SUPERSECRET123" not in json.dumps(doc)' || fail "echo leaked api_key value"
json "$body" 'doc["data"]["name"] == "probe"' || fail "echo dropped non-sensitive field"
json "$body" 'doc["data"]["token"] == "[REDACTED]"' || fail "echo did not redact token"

echo "== 3. platform unmatched → error envelope =="
resp=$(curl -s -w '\n%{http_code}' "$BASE_URL/api/v2/definitely-not-here")
status="${resp##*$'\n'}"
body="${resp%$'\n'*}"
[ "$status" = "404" ] || fail "platform 404 returned HTTP $status (want 404)"
json "$body" 'doc["error"]["code"] == "NOT_FOUND"' || fail "platform 404 not an error envelope"
json "$body" 'bool(doc.get("request_id"))' || fail "platform 404 missing request_id"

echo "== 4. legacy unmatched → legacy shape, no stamping =="
resp=$(curl -s -D /tmp/server-contract-headers "$BASE_URL/api/auth/definitely-not-here")
json "$resp" '"error" not in doc and doc.get("errors")' || fail "legacy 404 shape drifted"
if grep -qi '^x-request-id:' /tmp/server-contract-headers; then
  fail "legacy path must not stamp X-Request-ID"
fi

echo "== 5. CORS preflight =="
headers=$(curl -s -o /dev/null -D - -X OPTIONS "$BASE_URL/api/platform/anything" \
  -H "Origin: http://localhost:8080" \
  -H "Access-Control-Request-Headers: Content-Type, X-Project-Id")
echo "$headers" | grep -qi '^HTTP/1.1 204' || fail "preflight did not return 204"
echo "$headers" | grep -qi '^access-control-allow-origin: http://localhost:8080' || fail "preflight missing allow-origin"
echo "$headers" | grep -qi '^access-control-allow-credentials: true' || fail "preflight missing credentials"

if [ "$failures" -gt 0 ]; then
  echo "== $failures check(s) FAILED against $BASE_URL =="
  exit 1
fi
echo "== all contract smoke checks passed against $BASE_URL =="
