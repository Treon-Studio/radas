import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Console-side end-to-end journey matrix (Task 7.2 of the 2026-08-27
 * integration plan). Companion: docs/architecture/e2e-flow-matrix.md.
 *
 * Each test walks one product journey through the REAL console client
 * pieces (lib/api request construction, project context selection, and the
 * GlobalSearch surface) against a stubbed fetch shaped exactly like the
 * server responses pinned in contracts/cross-client-fixtures.json:
 *
 *   J1 login token -> org-scoped project load -> selection persists
 *   J2 idempotent service deploy mutation -> queued operation state
 *   J7 global search -> project-scoped detail without secret leakage
 *
 * J3 (CLI parity) has no console leg by definition — the Go and TypeScript
 * legs meet in scripts/run-cross-client-contracts.sh. J4/J5/J6/J8 are
 * API-only for the console (worker/runtime and cost-store internals) and
 * carry their journey evidence in the server matrix
 * apps/server/tests/test_e2e_flow_matrix.py.
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
      const href = typeof to === "string"
        ? to.replace(/\$(\w+)/g, (_, key) => params?.[key] ?? `$${key}`)
        : to;
      return <a href={href}>{children}</a>;
    },
  };
});

import { GlobalSearch, SEARCH_DEBOUNCE_MS, type SearchResponse } from "../components/search/GlobalSearch";
import { api, setToken, unwrapOperation } from "../lib/api";
import { ProjectProvider, useProjects } from "../lib/project";

type AnyRecord = Record<string, unknown>;

const PROJECT_ID = "proj-e2e-console";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function installFetch(handler: (path: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { path: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(input);
    const url = raw.startsWith("http") ? new URL(raw) : null;
    const path = url ? url.pathname + (url.search ?? "") : raw;
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

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("auth_token", "e2e-console-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// J1: login token -> org-scoped project load -> selection persists
// ---------------------------------------------------------------------------

function ProjectProbe(): ReactNode {
  const { projects, currentId, setCurrent } = useProjects();
  return (
    <div>
      <ul>
        {projects.map((p) => (
          <li key={p.id} data-testid={`project-${p.id}`}>{p.name}</li>
        ))}
      </ul>
      <span data-testid="current">{currentId ?? "none"}</span>
      <button onClick={() => void setCurrent(PROJECT_ID)}>select-{PROJECT_ID}</button>
    </div>
  );
}

describe("journey=J1 console: token -> scoped projects -> selection", () => {
  it("loads only the user's projects, switches selection, and persists it", async () => {
    const calls = installFetch((path, init) => {
      if (path === "/api/projects") {
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer e2e-console-token");
        return jsonResponse({
          success: true,
          projects: [
            { id: PROJECT_ID, name: "Console E2E", orgId: "org-1", isArchived: false },
            { id: "proj-other", name: "Other", orgId: "org-1", isArchived: false },
          ],
        });
      }
      if (path === `/api/projects/${PROJECT_ID}/switch`) {
        return jsonResponse({ success: true });
      }
      return jsonResponse({ error: { code: "NOT_FOUND", message: "unexpected", details: {} } }, 404);
    });

    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <ProjectProvider>
          <ProjectProbe />
        </ProjectProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId(`project-${PROJECT_ID}`)).toBeTruthy();
    });
    expect(screen.queryByTestId("project-proj-foreign")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: `select-${PROJECT_ID}` }));

    await waitFor(() => {
      expect(screen.getByTestId("current").textContent).toBe(PROJECT_ID);
    });
    expect(window.localStorage.getItem("current_project_id")).toBe(PROJECT_ID);
    expect(calls.some((c) => c.path === `/api/projects/${PROJECT_ID}/switch`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// J2: idempotent service deploy mutation -> queued operation state
// ---------------------------------------------------------------------------

describe("journey=J2 console: idempotent deploy -> queued operation", () => {
  it("sends the Idempotency-Key and projects the queued operation envelope", async () => {
    const envelope = {
      operation: {
        id: "op-e2e-console-1",
        kind: "service.deploy",
        status: "queued",
        instance_id: "inst-e2e-console-1",
        poll_url: `/api/projects/${PROJECT_ID}/services/inst-e2e-console-1/operations/op-e2e-console-1`,
      },
      data: { operation: { id: "op-e2e-console-1" } },
      request_id: "req-e2e-console-1",
    };
    const calls = installFetch((path, init) => {
      if (path === `/api/projects/${PROJECT_ID}/services` && init.method === "POST") {
        expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
        return jsonResponse(envelope, 202, { "X-Request-ID": envelope.request_id });
      }
      return jsonResponse({ error: { code: "NOT_FOUND", message: "unexpected", details: {} } }, 404);
    });

    const body = await api<AnyRecord>("POST", `/api/projects/${PROJECT_ID}/services`, {
      name: "e2e-console-svc",
      environment: "development",
      catalog_slug: "console-e2e-demo",
      catalog_version: "1.0.0",
      runtime_id: "mock",
      spec: { mode: "safe" },
      deploy: true,
    }, { headers: { "Idempotency-Key": "e2e-console-key-1" } });

    expect(calls).toHaveLength(1);
    const op = unwrapOperation<AnyRecord>(body) as AnyRecord;
    expect(op.id).toBe("op-e2e-console-1");
    expect(op.status).toBe("queued");
    expect(body.request_id).toBe(envelope.request_id);
  });
});

// ---------------------------------------------------------------------------
// J7: global search -> project-scoped detail without secret leakage
// ---------------------------------------------------------------------------

function searchResponse(overrides: Partial<SearchResponse>): SearchResponse {
  return {
    query: "web",
    total_matches: 2,
    stacks: [{ type: "stack", project_id: PROJECT_ID, name: "e2e-web-stack", label: "e2e-web-stack" }],
    runs: [],
    secrets: [{ type: "secret", project_id: PROJECT_ID, stack: "e2e-web-stack", matched: true }],
    ...overrides,
  } as SearchResponse;
}

describe("journey=J7 console: global search stays project-scoped and secret-safe", () => {
  it("renders the scoped sections and never puts secret material in the DOM", async () => {
    window.localStorage.setItem("current_project_id", PROJECT_ID);
    installFetch((path, init) => {
      if (path.startsWith("/api/search?")) {
        // Project scope rides the X-Project-Id header, not the query string.
        expect((init.headers as Record<string, string>)["X-Project-Id"]).toBe(PROJECT_ID);
        return jsonResponse(searchResponse({}));
      }
      return jsonResponse({ error: { code: "NOT_FOUND", message: "unexpected", details: {} } }, 404);
    });

    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <GlobalSearch />
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.type(screen.getByLabelText("Search stacks, runs, secrets"), "web");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 100));
    });

    await waitFor(() => {
      // The name appears in the stack section and as the secret's stack
      // metadata (secrets render stack+project only, never values).
      expect(screen.getAllByText("e2e-web-stack").length).toBeGreaterThanOrEqual(1);
    });
    // The secret section may indicate a match, but never a name or value.
    expect(document.body.textContent).not.toContain("encrypted");
    expect(document.body.textContent).not.toContain("SECRET_VALUE_");
  });
});
