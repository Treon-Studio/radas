#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

printf '%s\n' "Repository root: $ROOT_DIR"
printf '%s\n' "Checking required application paths..."
for app in server console cli worker; do
    path="apps/$app"
    if [[ ! -d "$path" ]]; then
        printf 'ERROR: required application path is missing: %s\n' "$path" >&2
        exit 1
    fi
    printf '  OK %s\n' "$path"
done

# Check executable/configuration scripts, but ignore comments and documentation. A
# stale path in a comment is historical context, not an active path reference.
script_files=()
while IFS= read -r file; do
    script_files+=("$file")
done < <(find . -type f \( -name '*.sh' -o -name '*.bash' -o -name '*.zsh' -o -name '*.cjs' -o -name '*.js' -o -name '*.mjs' -o -path './.github/workflows/*.yml' -o -path './.github/workflows/*.yaml' \) -not -path './.git/*' -print)

stale_references=''
obsolete_server_path='apps/opensible-'"server"
obsolete_console_path='apps/radas-'"console"
for file in "${script_files[@]}"; do
    [[ "$file" == "./scripts/verify-repo-layout.sh" ]] && continue
    matches=$(rg -n -e "$obsolete_server_path" -e "$obsolete_console_path" "$file" 2>/dev/null || true)
    while IFS= read -r match; do
        [[ -z "$match" ]] && continue
        code=${match#*:}
        code=${code#*:}
        [[ "$code" =~ ^[[:space:]]*([#*]|//) ]] && continue
        stale_references+="$file:$match"$'\n'
    done <<< "$matches"
done
if [[ -n "$stale_references" ]]; then
    printf '%s\n' "ERROR: active scripts reference obsolete application paths:" >&2
    printf '%s' "$stale_references" >&2
    exit 1
fi
printf '%s\n' "No active references to obsolete application paths."

printf '%s\n' "Tool versions:"
printf '  git %s\n' "$(git --version | awk '{print $3}')"
printf '  %s\n' "$(go version)"
printf '  node %s\n' "$(node --version)"
printf '  pnpm %s\n' "$(pnpm --version)"
printf '  %s\n' "$(python3 --version)"

route_count=$(rg -n 'get |post |put |patch |delete ' apps/server/lib/radas_web/router.ex | wc -l | tr -d ' ')
printf 'Server route declaration count: %s\n' "$route_count"
printf '%s\n' "Layout verification passed."
