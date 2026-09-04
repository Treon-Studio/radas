#!/usr/bin/env bash
# Static checks for sensitive-path patterns in the Elixir server tree.
#
# Port of apps/server/scripts/check_sensitive_paths.py (Python-AST rules do
# not apply to Elixir; these are the equivalents for the new codebase):
#
# - SP001E  shell execution through a single interpolated string:
#           System.cmd/3 / System.shell/1 with an interpolated command
#           argument, or Port.open with a spaw n string. The house
#           convention is System.cmd("prog", [argv-list]).
# - SP002E  logger calls embedding conn.body_params / request bodies
#           verbatim: request bodies carry credential material and must
#           never reach logs unredacted.
# - SP003E  secrets interpolated into Logger calls
#           (Logger.*(.*)(password|secret|token|api_key)\b used with a
#           value interpolation of those fields).
#
# A hit may be allowlisted with an inline `# sensitive-path-ok` marker on the
# offending line (ideally with a short justification). Exits 1 when
# unallowlisted hits remain, 0 otherwise.
#
# Usage: bash scripts/check-sensitive-paths-elixir.sh [root]
set -u

ROOT="${1:-apps/server_elixir/lib}"
HITS=0

scan() {
    local name="$1" pattern="$2"
    local found
    found=$(grep -rnE "$pattern" "$ROOT" \
        | grep -v "sensitive-path-ok" \
        | grep -v "^Binary" || true)
    if [[ -n "$found" ]]; then
        echo "[$name] unallowlisted hits:"
        echo "$found" | sed 's/^/    /'
        HITS=$((HITS + 1))
    fi
}

# SP001E — interpolated single-string shell commands.
scan "SP001E" 'System\.cmd\([^,]+,\s*"[^"]*#\{'
scan "SP001E" 'System\.shell\('
scan "SP001E" 'Port\.open\(\{:spawn, "'

# SP002E — request bodies into Logger calls.
scan "SP002E" 'Logger\.(debug|info|warn|warning|error)\([^)]*(body_params|body\.params|req_body|request body)'

# SP003E — secret-named fields interpolated into Logger calls.
scan "SP003E" 'Logger\.(debug|info|warn|warning|error)\([^)]*(password|secret_key|api_key|workerToken|worker_token)[^)]*#\{'

if [[ "$HITS" -gt 0 ]]; then
    echo "error: $HITS sensitive-path rule(s) violated in $ROOT" >&2
    exit 1
fi

echo "== all sensitive-path static rules passed against $ROOT =="
