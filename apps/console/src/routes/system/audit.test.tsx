import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Audit log page contract: tenant header propagation, owner/admin 403 state,
 * loading/empty states, and the prune mutation with an Idempotency-Key.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/system/audit" }),
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

import { AuditPage } from "./audit";

type CapturedCall = { path: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(handler: (path: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: CapturedCall[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(input);
    const url = raw.startsWith("http") ? new URL(raw) : null;
    const path = (url ? url.pathname + (url.search ?? "") : raw);
    const captured = { path: path.split("?")[0] ?? raw, init: init ?? {} };
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

function renderPage(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <AuditPage />
    </QueryClientProvider>,
  );
}

function headerOf(call: CapturedCall | undefined, name: string): string | null {
  return call ? new Headers(call.init.headers).get(name) : null;
}

const ENTRIES = {
  success: true,
  count: 1,
  entries: [
    {
      id: "a1",
      actor_user_id: "user-9",
      action: "project.update",
      target_type: "project",
      target_id: "p1",
      created_at: 1_720_000_000,
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("auth_token", "token-1");
  window.localStorage.setItem("current_project_id", "p1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AuditPage", () => {
  it("shows a loading state, then renders audit entries with the tenant header", async () => {
    const calls = installFetch((path) => {
      expect(path.startsWith("/api/audit-log")).toBe(true);
      return jsonResponse(ENTRIES);
    });
    const { container } = renderPage(makeClient());

    expect(screen.getByRole("status")).toBeInTheDocument(); // loading state
    await waitFor(() => expect(screen.getByText("project.update")).toBeInTheDocument());
    expect(screen.getByText("user-9")).toBeInTheDocument();
    expect(container.textContent).not.toContain("Access denied");
    expect(headerOf(calls[0], "X-Project-Id")).toBe("p1");
    expect(headerOf(calls[0], "Authorization")).toBe("Bearer token-1");
  });

  it("renders the unauthorized state on 403 (non owner/admin role)", async () => {
    installFetch(() => jsonResponse({ success: false, error: "Audit access denied" }, 403));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("Access denied (403)")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("project.update")).not.toBeInTheDocument();
  });

  it("renders the empty state when there are no entries", async () => {
    installFetch(() => jsonResponse({ success: true, count: 0, entries: [] }));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("No audit entries")).toBeInTheDocument());
  });

  it("renders a server-error state with retry on 500", async () => {
    installFetch(() => jsonResponse({ success: false, error: "Error reading audit log" }, 500));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText(/Server error/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("prunes with a POST, Idempotency-Key and tenant header, then refetches", async () => {
    const user = userEvent.setup();
    let pruneCalls = 0;
    const calls = installFetch((path, init) => {
      if (path.startsWith("/api/audit-log/prune")) {
        pruneCalls += 1;
        expect(init.method).toBe("POST");
        return jsonResponse({ success: true, deleted_count: 3, retention_days: 90 });
      }
      return jsonResponse(ENTRIES);
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByText("project.update")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Prune…" }));
    await user.click(screen.getByRole("button", { name: "Prune entries" }));

    await waitFor(() => expect(pruneCalls).toBe(1));
    const prune = calls.find((c) => c.path.startsWith("/api/audit-log/prune"));
    expect(headerOf(prune, "Idempotency-Key")).toBeTruthy();
    expect(headerOf(prune, "X-Project-Id")).toBe("p1");
    expect(JSON.parse(String(prune?.init.body))).toEqual({ retention_days: 90 });
    // List is invalidated after pruning.
    await waitFor(() => {
      const listGets = calls.filter(
        (c) => c.path === "/api/audit-log" && (c.init.method ?? "GET") === "GET",
      );
      expect(listGets.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("switches the tenant header when the active project changes", async () => {
    const calls = installFetch(() => jsonResponse(ENTRIES));
    const client = makeClient();
    renderPage(client);
    await waitFor(() => expect(headerOf(calls[0], "X-Project-Id")).toBe("p1"));

    window.localStorage.setItem("current_project_id", "p2");
    await act(async () => {
      await client.invalidateQueries();
    });

    await waitFor(() => {
      const latest = calls[calls.length - 1];
      expect(headerOf(latest, "X-Project-Id")).toBe("p2");
    });
  });
});
