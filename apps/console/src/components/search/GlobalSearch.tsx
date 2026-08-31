import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  RiSearchLine as SearchIcon,
  RiStackLine as StackIcon,
  RiPlayLine as RunIcon,
  RiShieldKeyholeLine as SecretIcon,
} from "@remixicon/react";
import { ENTITY_STATES } from "@/lib/ontology";
import { api } from "@/lib/api";
import { getCurrentProjectId } from "@/lib/project";
import { QueryStateView } from "@/components/system/QueryStateView";
import { MascotState } from "@/components/common/MascotState";
import { cn } from "@/lib/utils";

/**
 * Global search (UC396 / UC637) — command/search UI wired to GET /api/search.
 *
 * Contract (apps/server/api/search_routes.py → services/unified_search.py):
 * the response is `{query, total_matches, stacks, runs, playbooks, secrets}`
 * where stacks carry `name`, runs carry `id`/`stack`, and secrets carry ONLY
 * `project_id`/`stack` metadata — the server never returns secret values, and
 * this component additionally projects secrets down to that metadata before
 * rendering so no unknown field can leak into the DOM.
 *
 * Behaviour: Cmd/Ctrl+K toggles, Escape closes, 300 ms debounce, minimum query
 * length of 2, 20-result limit, AbortController signal forwarded through
 * api() for cancellation, per-project cache keys. A trailing `:statename`
 * token that names any ontology entity state (`web :failed`) filters runs and
 * stacks client-side by status and is stripped from the server query — see
 * parseStateToken below.
 */

export const SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_RESULT_LIMIT = 20;

type StackHit = {
  type: "stack";
  project_id?: string;
  name?: string;
  provider?: string | null;
  env?: string | null;
  description?: string;
  // Present on some backends; consumed by :state token filtering below.
  status?: string;
};
type RunHit = {
  type: "run";
  project_id?: string;
  id?: string;
  stack?: string;
  action?: string;
  status?: string;
  triggered_by?: string;
};
type SecretHit = {
  type: "secret";
  project_id?: string;
  stack?: string;
  matched?: boolean;
  // The server never sends these; listed so the defensive projection below
  // demonstrably drops value-like fields instead of rendering them.
  value?: unknown;
  data?: unknown;
};
export type SearchResponse = {
  query?: string;
  total_matches?: number;
  stacks?: StackHit[];
  runs?: RunHit[];
  secrets?: SecretHit[];
};

/**
 * Secrets are rendered as metadata only (stack + project). Everything else —
 * including any value-like field a non-conforming server might add — is
 * stripped before it can reach the DOM.
 */
export function projectSecretMeta(secret: SecretHit): { stack: string; projectId?: string } {
  return {
    stack: typeof secret?.stack === "string" ? secret.stack : "",
    projectId: typeof secret?.project_id === "string" ? secret.project_id : undefined,
  };
}

/**
 * Every state across all ontology entities, lowercased. Derived from
 * contracts/domain-ontology.json via the generated lib/ontology.ts — the
 * token set is never hardcoded per entity here.
 */
const KNOWN_STATES: ReadonlySet<string> = new Set(
  Object.values(ENTITY_STATES).flatMap((states) => states.map((s) => s.toLowerCase())),
);

/**
 * Concept-aware `:state` token: a trailing `:statename` that matches any
 * entity state in the ontology (case-insensitively, e.g. `web :failed`)
 * splits into the bare search term plus an active state filter. Tokens that
 * name no entity state stay literal so ordinary text containing a colon is
 * untouched.
 */
export function parseStateToken(query: string): { term: string; state: string | null } {
  const trimmed = query.trim();
  const match = /:(\S+)$/.exec(trimmed);
  if (!match) return { term: trimmed, state: null };
  const token = (match[1] ?? "").toLowerCase();
  if (!token || !KNOWN_STATES.has(token)) return { term: trimmed, state: null };
  return { term: trimmed.slice(0, match.index).trim(), state: token };
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Global hotkey: Cmd/Ctrl+K toggles the palette, Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Focus the input when opening; reset the query when closing.
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  // Debounce the query before it hits the wire or the cache key.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const projectId = getCurrentProjectId();
  const queryReady = debouncedQuery.length >= SEARCH_MIN_QUERY_LENGTH;

  // Concept-aware search: a trailing :state token never reaches the server —
  // the bare term is queried and runs/stacks are filtered by status below.
  // The cache key stays the full query so token variants don't collide.
  const { term: searchQuery, state: stateToken } = parseStateToken(debouncedQuery);

  const search = useQuery({
    queryKey: ["global-search", projectId ?? "none", debouncedQuery, SEARCH_RESULT_LIMIT],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ q: searchQuery, limit: String(SEARCH_RESULT_LIMIT) });
      // api() attaches Authorization + X-Project-Id and forwards `signal`
      // through RequestInit so TanStack Query can cancel superseded requests.
      return api<SearchResponse>("GET", `/api/search?${params.toString()}`, undefined, { signal });
    },
    enabled: open && queryReady,
  });

  // With an active :state token, hits without a usable status are dropped:
  // only rows that actually match the state (case-insensitively) survive.
  const stacks = (search.data?.stacks ?? [])
    .filter((s) => typeof s?.name === "string" && s.name)
    .filter((s) => !stateToken || s.status?.toLowerCase() === stateToken)
    .slice(0, SEARCH_RESULT_LIMIT);
  const runs = (search.data?.runs ?? [])
    .filter((r) => r && (typeof r.id === "string" || typeof r.stack === "string"))
    .filter((r) => !stateToken || r.status?.toLowerCase() === stateToken)
    .slice(0, SEARCH_RESULT_LIMIT);
  const secrets = (search.data?.secrets ?? [])
    .map(projectSecretMeta)
    .filter((s) => s.stack)
    .slice(0, SEARCH_RESULT_LIMIT);
  const hasResults = stacks.length + runs.length + secrets.length > 0;

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-1.5 h-8 px-3 text-xs font-mono uppercase tracking-wider pxl-corner-sm text-[var(--color-muted-foreground)] border-2 border-[var(--color-border)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-all select-none"
        aria-label="Search"
        title="Search (Ctrl/Cmd+K)"
      >
        <SearchIcon className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Search</span>
        <kbd className="hidden lg:inline text-[10px] border border-[var(--color-border)] px-1 pxl-corner-sm">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] px-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Global search"
          onClick={close}
        >
          <div
            className="w-full max-w-xl bg-[var(--color-card)] border-2 border-[var(--color-border)] pxl-corner-md pxl-card-shadow overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 h-12 border-b-2 border-[var(--color-border)]">
              <SearchIcon className="h-4 w-4 text-[var(--color-muted-foreground)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stacks, runs, secrets…"
                aria-label="Search stacks, runs, secrets"
                className="flex-1 bg-transparent outline-none text-sm font-mono placeholder:text-[var(--color-muted-foreground)]"
              />
              <kbd className="text-[10px] font-mono text-[var(--color-muted-foreground)] border border-[var(--color-border)] px-1.5 py-0.5 pxl-corner-sm">esc</kbd>
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              {!queryReady ? (
                <p className="px-4 py-6 text-xs text-center text-[var(--color-muted-foreground)] font-mono">
                  Type at least {SEARCH_MIN_QUERY_LENGTH} characters to search across stacks, runs and secrets.
                </p>
              ) : (
                <>
                  {search.isFetching && (
                    <p role="status" aria-live="polite" className="px-4 py-2 text-xs text-[var(--color-muted-foreground)] font-mono">
                      Searching…
                    </p>
                  )}
                  <QueryStateView
                    error={search.error}
                    onRetry={() => void search.refetch()}
                    forbiddenMessage="Your role does not have permission to search this project."
                  />
                  {!search.error && !hasResults && !search.isFetching && !search.isPending && (
                    <div className="py-4">
                      <MascotState
                        type="empty_search"
                        size="sm"
                        title="NO RESULTS FOUND"
                        description={`We couldn't find any resources matching "${debouncedQuery}".`}
                      />
                    </div>
                  )}

                  {stacks.length > 0 && (
                    <section aria-label="Stack results" className="py-1">
                      <h3 className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--color-muted-foreground)]">Stacks</h3>
                      {stacks.map((hit) => (
                        <Link
                          key={`stack-${hit.project_id ?? "p"}-${hit.name}`}
                          to="/cloud/stacks/$stackId"
                          params={{ stackId: hit.name as string }}
                          onClick={close}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--color-muted)] transition-colors"
                        >
                          <StackIcon className="h-4 w-4 text-cyan-400 shrink-0" />
                          <span className="font-mono truncate">{hit.name}</span>
                          {hit.provider && <span className="ml-auto text-[10px] font-mono text-[var(--color-muted-foreground)]">{hit.provider}</span>}
                        </Link>
                      ))}
                    </section>
                  )}

                  {runs.length > 0 && (
                    <section aria-label="Run results" className="py-1 border-t-2 border-[var(--color-border)]">
                      <h3 className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--color-muted-foreground)]">Runs</h3>
                      {runs.map((hit) => (
                        <Link
                          key={`run-${hit.project_id ?? "p"}-${hit.id ?? hit.stack}`}
                          to="/cloud/summary"
                          onClick={close}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--color-muted)] transition-colors"
                        >
                          <RunIcon className="h-4 w-4 text-emerald-400 shrink-0" />
                          <span className="font-mono truncate">{hit.id || hit.stack}</span>
                          {hit.stack && hit.id && <span className="text-xs text-[var(--color-muted-foreground)] truncate">({hit.stack})</span>}
                          {hit.status && (
                            <span
                              className={cn(
                                "ml-auto text-[10px] font-mono uppercase shrink-0",
                                hit.status === "success" || hit.status === "completed"
                                  ? "text-emerald-400"
                                  : hit.status === "failed" || hit.status === "error"
                                    ? "text-red-400"
                                    : "text-[var(--color-muted-foreground)]",
                              )}
                            >
                              {hit.status}
                            </span>
                          )}
                        </Link>
                      ))}
                    </section>
                  )}

                  {secrets.length > 0 && (
                    <section aria-label="Secret results" className="py-1 border-t-2 border-[var(--color-border)]">
                      <h3 className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--color-muted-foreground)]">Secrets</h3>
                      {secrets.map((meta) => (
                        <Link
                          key={`secret-${meta.projectId ?? "p"}-${meta.stack}`}
                          to="/cloud/stacks/$stackId"
                          params={{ stackId: meta.stack }}
                          onClick={close}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--color-muted)] transition-colors"
                        >
                          <SecretIcon className="h-4 w-4 text-amber-400 shrink-0" />
                          <span className="font-mono truncate">{meta.stack}</span>
                          <span className="ml-auto text-[10px] font-mono text-[var(--color-muted-foreground)] shrink-0">secret · open stack</span>
                        </Link>
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
