#!/usr/bin/env bash
# Post-cutover deployment smoke test. Required checks are liveness, readiness,
# and the platform contract. Authenticated and router checks are opt-in.
set -euo pipefail

BASE_URL="${RADAS_SMOKE_BASE_URL:-http://127.0.0.1:4000}"
TIMEOUT="${RADAS_SMOKE_TIMEOUT:-10}"
RETRIES="${RADAS_SMOKE_RETRIES:-3}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/radas-smoke.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
request() {
  local method="$1" path="$2" output="$3" body="${4:-}"
  local args=(-sS --fail-with-body --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" -X "$method")
  if [[ -n "$body" ]]; then args+=(-H 'Content-Type: application/json' --data "$body"); fi
  for attempt in $(seq 1 "$RETRIES"); do
    if curl "${args[@]}" "$BASE_URL$path" -o "$output"; then return 0; fi
    [[ "$attempt" == "$RETRIES" ]] || sleep 1
  done
  return 1
}
json_assert() {
  local file="$1" expression="$2"
  python3 - "$file" "$expression" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    document = json.load(fh)
if not bool(eval(sys.argv[2], {"__builtins__": {}}, {"doc": document})):
    raise SystemExit(1)
PY
}

printf '== post-cutover smoke: %s ==\n' "$BASE_URL"
request GET /api/healthz "$TMP_DIR/healthz.json" || fail 'liveness request failed'
json_assert "$TMP_DIR/healthz.json" 'doc.get("status") == "ok"' || fail 'liveness contract failed'
printf 'PASS: /api/healthz\n'

request GET /api/readyz "$TMP_DIR/readyz.json" || fail 'readiness request failed'
json_assert "$TMP_DIR/readyz.json" 'doc.get("data", {}).get("status") == "ready"' || fail 'readiness contract failed'
printf 'PASS: /api/readyz\n'

# Reuse the detailed platform/redaction/CORS checks against the same origin.
RADAS_ELIXIR_BASE_URL="$BASE_URL" bash "$(dirname "$0")/check-server-contract.sh" \
  >"$TMP_DIR/contract.log" || { cat "$TMP_DIR/contract.log"; fail 'platform contract smoke failed'; }
cat "$TMP_DIR/contract.log"

if [[ -n "${RADAS_SMOKE_ROUTER_URL:-}" ]]; then
  router_url="$RADAS_SMOKE_ROUTER_URL"
  curl -sS --fail-with-body --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" \
    "$router_url/api/healthz" -o "$TMP_DIR/router-healthz.json" || fail 'router liveness failed'
  json_assert "$TMP_DIR/router-healthz.json" 'doc.get("status") == "ok"' || fail 'router liveness contract failed'
  printf 'PASS: router /api/healthz\n'
else
  printf 'SKIP: router origin (set RADAS_SMOKE_ROUTER_URL)\n'
fi

if [[ -n "${RADAS_SMOKE_USERNAME:-}" && -n "${RADAS_SMOKE_PASSWORD:-}" ]]; then
  request POST /api/auth/login "$TMP_DIR/login.json" \
    "$(python3 -c 'import json,os; print(json.dumps({"username":os.environ["RADAS_SMOKE_USERNAME"],"password":os.environ["RADAS_SMOKE_PASSWORD"]}))')" \
    || fail 'smoke-account login failed'
  json_assert "$TMP_DIR/login.json" 'bool(doc.get("access_token"))' || fail 'login returned no access token'
  token="$(python3 -c 'import json; print(json.load(open("'$TMP_DIR'/login.json"))["access_token"])')"
  curl -sS --fail-with-body --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" \
    -H "Authorization: Bearer $token" "$BASE_URL/api/projects" -o "$TMP_DIR/projects.json" \
    || fail 'authenticated project read failed'
  json_assert "$TMP_DIR/projects.json" 'doc.get("success") is True' || fail 'project read contract failed'
  printf 'PASS: authenticated login + project read\n'
else
  printf 'SKIP: authenticated flow (set RADAS_SMOKE_USERNAME and RADAS_SMOKE_PASSWORD)\n'
fi

printf '== post-cutover smoke passed ==\n'
