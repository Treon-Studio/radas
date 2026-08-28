import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LocaleProvider } from "@/lib/i18n";
import { ProjectProvider } from "@/lib/project";
import { qk } from "@/lib/query";
import { Dashboard } from "./dashboard";

/**
 * Dashboard widget contract (Task 4.4): widgets read the active project from
 * the same ProjectProvider identity as the rest of the console, their query
 * keys embed the projectId via the shared `qk` helpers, and one widget's API
 * failure must not take down the rest of the dashboard (partial failure).
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

const PROJECTS = [{ id: "p1", name: "Alpha" }];
const WORKERS = [{ id: "w1", name: "worker-1", status: "online" }, { id: "w2", name: "worker-2", status: "online" }];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(handler: (path: string) => Response) {
  const calls: { path: string }[] = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const raw = String(input);
    const url = raw.startsWith("http") ? new URL(raw) : null;
    const path = (url ? url.pathname + (url.search ?? "") : raw);
    calls.push({ path });
    return Promise.resolve(handler(path));
  }));
  return calls;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderDashboard(client: QueryClient) {
  return render(
    <LocaleProvider>
      <QueryClientProvider client={client}>
        <ProjectProvider>
          <Dashboard />
        </ProjectProvider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
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

describe("Dashboard widgets", () => {
  it("renders the workers widget from the mocked API with a query key embedding the active project id", async () => {
    const calls = installFetch((path) => {
      if (path === "/api/projects") return jsonResponse({ projects: PROJECTS });
      if (path === "/api/orgs") return jsonResponse({ orgs: [{ id: "o1", name: "Treon Studio" }] });
      if (path.startsWith("/api/system/workers")) return jsonResponse({ workers: WORKERS });
      return jsonResponse({});
    });
    const client = makeClient();
    renderDashboard(client);

    await waitFor(() => expect(screen.getByText("2 worker(s) online")).toBeInTheDocument());

    // The request went out with the project identity attached.
    const workersCall = calls.find((c) => c.path.startsWith("/api/system/workers"));
    expect(workersCall).toBeDefined();

    // The widget's cache entry lives under the shared qk key that embeds
    // the active project id (["system", "workers-summary", "p1"]).
    const cached = client.getQueryData(qk.dashboardWorkers("p1")) as { workers?: unknown[] } | undefined;
    expect(cached?.workers).toHaveLength(2);
    const keys = client.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(qk.dashboardWorkers("p1"));
    expect(keys.some((k) => Array.isArray(k) && k.includes("p1"))).toBe(true);
  });

  it("keeps the rest of the dashboard usable when the workers widget API fails", async () => {
    installFetch((path) => {
      if (path === "/api/projects") return jsonResponse({ projects: PROJECTS });
      if (path === "/api/orgs") return jsonResponse({ orgs: [{ id: "o1", name: "Treon Studio" }] });
      if (path.startsWith("/api/system/workers")) return jsonResponse({ error: { message: "worker registry down" } }, 500);
      return jsonResponse({});
    });
    renderDashboard(makeClient());

    // The failed widget degrades to its fallback without crashing the page…
    await waitFor(() => expect(screen.getByText("1 worker(s) online")).toBeInTheDocument());
    // …and project widgets rendered from the active project identity still show.
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    expect(screen.getByText(/Welcome back/)).toBeInTheDocument();
  });
});
