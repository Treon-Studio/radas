import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * GlobalSearch contract tests (UC396): debounce + minimum query length,
 * AbortSignal cancellation plumbing, project-scoped headers, separate
 * stack/run/secret sections wired to the correct project-scoped routes,
 * secret values never reaching the DOM, and loading/empty/error/keyboard
 * behaviour.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
    }: {
      to?: string;
      params?: Record<string, string>;
      children?: ReactNode;
    }) => {
      // Resolve $param placeholders so tests can assert concrete hrefs.
      const href = typeof to === "string"
        ? to.replace(/\$(\w+)/g, (_, key) => params?.[key] ?? `$${key}`)
        : to;
      return <a href={href}>{children}</a>;
    },
  };
});

import {
  GlobalSearch,
  SEARCH_DEBOUNCE_MS,
  type SearchResponse,
} from "./GlobalSearch";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type CapturedCall = { path: string; init: RequestInit };

function installFetch(handler: (path: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: CapturedCall[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(input);
    const url = raw.startsWith("http") ? new URL(raw) : null;
    // Keep the query string — search assertions need q/limit params.
    const path = (url ? url.pathname + (url.search ?? "") : raw);
    const captured = { path, init: init ?? {} };
    calls.push(captured);
    return Promise.resolve(handler(path, init ?? {}));
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderSearch(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <GlobalSearch />
    </QueryClientProvider>,
  );
}

async function openAndType(query: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Search" }));
  const input = screen.getByLabelText("Search stacks, runs, secrets");
  if (query) await user.type(input, query);
  return user;
}

/** Wait long enough for the debounce window to elapse. */
async function pastDebounce() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 100));
  });
}

function searchResponse(overrides: Partial<SearchResponse>): SearchResponse {
  return {
    query: "web",
    total_matches: 0,
    stacks: [],
    runs: [],
    secrets: [],
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("auth_token", "token-1");
  window.localStorage.setItem("current_project_id", "p1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GlobalSearch", () => {
  it("does not fetch below the minimum query length, then debounces before fetching with q and limit", async () => {
    const calls = installFetch(() => jsonResponse(searchResponse({})));
    renderSearch(makeClient());

    await openAndType("a");
    await pastDebounce();
    expect(calls.filter((c) => c.path.startsWith("/api/search"))).toHaveLength(0);

    // Second keystroke completes a valid query; the debounce fires once.
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search stacks, runs, secrets"), "b");
    await waitFor(() =>
      expect(calls.filter((c) => c.path.startsWith("/api/search"))).toHaveLength(1),
    );
    expect(calls[0]?.path).toBe("/api/search?q=ab&limit=20");
  });

  it("shows a loading indicator while the search request is in flight", async () => {
    installFetch(() => new Promise(() => {})); // never settles
    renderSearch(makeClient());
    await openAndType("web");

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Searching…"));
  });

  it("renders stacks, runs and secrets as separate sections linking to project-scoped routes", async () => {
    installFetch(() =>
      jsonResponse(
        searchResponse({
          total_matches: 3,
          stacks: [
            {
              type: "stack",
              project_id: "p1",
              name: "web-core",
              provider: "bytedc",
              env: "prod",
              description: "main stack",
            },
          ],
          runs: [
            {
              type: "run",
              project_id: "p1",
              id: "run-9",
              stack: "web-core",
              action: "apply",
              status: "success",
              triggered_by: "admin",
            },
          ],
          secrets: [{ type: "secret", project_id: "p1", stack: "web-core", matched: true }],
        }),
      ),
    );
    renderSearch(makeClient());
    await openAndType("web");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Stacks" })).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Runs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Secrets" })).toBeInTheDocument();

    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/cloud/stacks/web-core"); // stack result
    expect(hrefs).toContain("/cloud/summary"); // run result (no dedicated run route)
    // Secret result links to its stack detail, never to a secret value.
    expect(hrefs.filter((h) => h === "/cloud/stacks/web-core").length).toBeGreaterThanOrEqual(2);
  });

  it("never renders secret values, only stack/project metadata", async () => {
    const { container } = renderSearch(makeClient());
    installFetch(() =>
      jsonResponse(
        searchResponse({
          total_matches: 1,
          secrets: [
            {
              type: "secret",
              project_id: "p1",
              stack: "web-core",
              matched: true,
              // The server never sends these; a non-conforming response must
              // still not leak them through the UI.
              value: "hunter2-super-secret",
              data: { password: "hunter2-super-secret" },
            },
          ],
        }),
      ),
    );
    await openAndType("web");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Secrets" })).toBeInTheDocument());
    expect(screen.getByText("web-core")).toBeInTheDocument();
    expect(container.textContent).not.toContain("hunter2-super-secret");
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
  });

  it("shows the empty state when the query matches nothing", async () => {
    installFetch(() => jsonResponse(searchResponse({ query: "zz" })));
    renderSearch(makeClient());
    await openAndType("zz");

    await waitFor(() => expect(screen.getByText(/No results for/)).toBeInTheDocument());
    expect(screen.getByText(/No results for/).textContent).toContain("zz");
  });

  it("shows the error state with a retry affordance on server failure", async () => {
    installFetch(() => jsonResponse({ error: { message: "backend exploded" } }, 500));
    renderSearch(makeClient());
    await openAndType("web");

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/Server error: backend exploded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("opens with Ctrl/Cmd+K, closes on Escape, and opens from the header button", async () => {
    installFetch(() => jsonResponse(searchResponse({})));
    const user = userEvent.setup();
    renderSearch(makeClient());

    expect(screen.queryByRole("dialog", { name: "Global search" })).not.toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("dialog", { name: "Global search" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Global search" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("dialog", { name: "Global search" })).toBeInTheDocument();
  });

  it("filters runs and stacks by a trailing :state token and searches without the token", async () => {
    const calls = installFetch(() =>
      jsonResponse(
        searchResponse({
          query: "web",
          total_matches: 5,
          stacks: [
            { type: "stack", project_id: "p1", name: "web-failed", status: "failed" },
            { type: "stack", project_id: "p1", name: "web-running", status: "running" },
            // No status field: filtered out while a state token is active.
            { type: "stack", project_id: "p1", name: "web-missing" },
          ],
          runs: [
            // UPPERCASE on purpose: state matching is case-insensitive.
            { type: "run", project_id: "p1", id: "run-1", stack: "web-failed", status: "FAILED" },
            { type: "run", project_id: "p1", id: "run-2", stack: "web-running", status: "running" },
            { type: "run", project_id: "p1", id: "run-3", stack: "web-missing" },
          ],
        }),
      ),
    );
    renderSearch(makeClient());
    await openAndType("web :failed");

    await waitFor(() => expect(screen.getByText("web-failed")).toBeInTheDocument());
    expect(screen.getByText("run-1")).toBeInTheDocument();
    // Running and status-less hits are filtered out on both entity types.
    expect(screen.queryByText("web-running")).not.toBeInTheDocument();
    expect(screen.queryByText("web-missing")).not.toBeInTheDocument();
    expect(screen.queryByText("run-2")).not.toBeInTheDocument();
    expect(screen.queryByText("run-3")).not.toBeInTheDocument();
    // The token never reaches the server: the query is the bare term.
    const searchCall = calls.find((c) => c.path.startsWith("/api/search"));
    expect(searchCall).toBeDefined();
    expect(new URL(`http://x${searchCall?.path}`).searchParams.get("q")).toBe("web");
  });

  it("keeps unknown :tokens literal instead of treating them as a state filter", async () => {
    const calls = installFetch(() =>
      jsonResponse(
        searchResponse({
          total_matches: 1,
          stacks: [{ type: "stack", project_id: "p1", name: "web-core" }],
        }),
      ),
    );
    renderSearch(makeClient());
    await openAndType("web :bogus");

    await waitFor(() => expect(screen.getByText("web-core")).toBeInTheDocument());
    const searchCall = calls.find((c) => c.path.startsWith("/api/search"));
    expect(new URL(`http://x${searchCall?.path}`).searchParams.get("q")).toBe("web :bogus");
  });

  it("sends Bearer + X-Project-Id headers and an AbortSignal for cancellation", async () => {
    const calls = installFetch(() =>
      jsonResponse(
        searchResponse({
          total_matches: 1,
          stacks: [{ type: "stack", project_id: "p1", name: "web-core" }],
        }),
      ),
    );
    renderSearch(makeClient());
    await openAndType("web");

    await waitFor(() => expect(screen.getByText("web-core")).toBeInTheDocument());
    const search = calls.find((c) => c.path.startsWith("/api/search"));
    expect(search).toBeDefined();
    const headers = new Headers(search?.init.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-1");
    expect(headers.get("X-Project-Id")).toBe("p1");
    expect(search?.init.signal).toBeInstanceOf(AbortSignal);
  });
});
