import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Branch mapping page contract: per-stack rule loading, 403/empty states,
 * save + resolve-branch mutations with Idempotency-Key, matched-environment
 * preview, and tenant switching with fresh X-Project-Id/project path.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/system/branch-mapping" }),
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

import { BranchMappingPage } from "./branch-mapping";

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
    const path = (url ? url.pathname : raw).split("?")[0] ?? raw;
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

function renderPage(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <BranchMappingPage />
    </QueryClientProvider>,
  );
}

function headerOf(call: CapturedCall | undefined, name: string): string | null {
  return call ? new Headers(call.init.headers).get(name) : null;
}

const RULES = { rules: [{ pattern: "^main$", environment: "prod" }] };

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("auth_token", "token-1");
  window.localStorage.setItem("current_project_id", "p1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function loadStack(user: ReturnType<typeof userEvent.setup>, stack: string) {
  await user.type(screen.getByLabelText("Stack name"), stack);
  await user.click(screen.getByRole("button", { name: "Load rules" }));
}

describe("BranchMappingPage", () => {
  it("shows a loading state, then renders rules for the loaded stack", async () => {
    const user = userEvent.setup();
    let resolveRules!: (response: Response) => void;
    const calls = installFetch(() => new Promise<Response>((resolve) => { resolveRules = resolve; }));
    renderPage(makeClient());

    await loadStack(user, "web");
    expect(screen.getByRole("status")).toBeInTheDocument(); // loading state
    resolveRules(jsonResponse(RULES));
    await waitFor(() => expect(screen.getByDisplayValue("^main$")).toBeInTheDocument());
    expect(screen.getByLabelText(/Environment for rule 1/)).toHaveValue("prod");
    expect(headerOf(calls[0], "X-Project-Id")).toBe("p1");
  });

  it("renders the unauthorized state on 403", async () => {
    const user = userEvent.setup();
    installFetch(() => jsonResponse({ success: false, error: "Project access denied" }, 403));
    renderPage(makeClient());

    await loadStack(user, "web");
    await waitFor(() => expect(screen.getByText("Access denied (403)")).toBeInTheDocument());
  });

  it("renders the empty state when a stack has no rules", async () => {
    const user = userEvent.setup();
    installFetch(() => jsonResponse({ rules: [] }));
    renderPage(makeClient());

    await loadStack(user, "web");
    await waitFor(() => expect(screen.getByText("No mapping rules for this stack")).toBeInTheDocument());
  });

  it("saves edited rules with a PUT and an Idempotency-Key", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if (path === "/api/projects/p1/stacks/web/branch-mapping" && init.method === "PUT") {
        return jsonResponse({ success: true });
      }
      if (path.endsWith("/resolve-branch")) {
        return jsonResponse({ environment: "dev", stack_override: null, matched_rule: null });
      }
      return jsonResponse(RULES);
    });
    renderPage(makeClient());
    await loadStack(user, "web");
    await waitFor(() => expect(screen.getByDisplayValue("^main$")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Add rule/ }));
    await user.type(screen.getByLabelText("Pattern for rule 2"), "^staging-");
    await user.selectOptions(screen.getByLabelText("Environment for rule 2"), "staging");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const saved = calls.find(
        (c) => c.path === "/api/projects/p1/stacks/web/branch-mapping" && c.init.method === "PUT",
      );
      expect(saved).toBeDefined();
      expect(headerOf(saved, "Idempotency-Key")).toBeTruthy();
      expect(JSON.parse(String(saved?.init.body))).toEqual({
        rules: [
          { pattern: "^main$", environment: "prod" },
          { pattern: "^staging-", environment: "staging" },
        ],
      });
    });
  });

  it("previews the matched environment via resolve-branch without exposing secrets", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if (path === "/api/projects/p1/stacks/web/resolve-branch") {
        expect(init.method).toBe("POST");
        return jsonResponse({
          environment: "prod",
          stack_override: null,
          matched_rule: { pattern: "^main$", environment: "prod" },
        });
      }
      return jsonResponse(RULES);
    });
    renderPage(makeClient());
    await loadStack(user, "web");
    await waitFor(() => expect(screen.getByDisplayValue("^main$")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Branch to resolve"), "main");
    await user.click(screen.getByRole("button", { name: /Resolve/ }));

    const preview = await waitFor(() => {
      const el = screen.getByTestId("resolve-preview");
      expect(el.textContent).toContain("prod");
      expect(el.textContent).toContain("^main$");
      expect(el.textContent).toContain("none (uses this stack)");
      return el;
    });
    expect(preview.textContent.toLowerCase()).not.toContain("secret");
    const resolved = calls.find((c) => c.path === "/api/projects/p1/stacks/web/resolve-branch");
    expect(headerOf(resolved, "Idempotency-Key")).toBeTruthy();
    expect(JSON.parse(String(resolved?.init.body))).toEqual({ branch: "main" });
  });

  it("switches tenants: the next fetch uses the new project id in path and header", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path) => {
      if (path === "/api/projects/p2/stacks/web/branch-mapping") {
        return jsonResponse({ rules: [{ pattern: "^release/", environment: "staging" }] });
      }
      return jsonResponse(RULES);
    });
    const client = makeClient();
    renderPage(client);
    await loadStack(user, "web");
    await waitFor(() => expect(screen.getByDisplayValue("^main$")).toBeInTheDocument());

    window.localStorage.setItem("current_project_id", "p2");
    await act(async () => {
      await client.invalidateQueries();
    });

    await waitFor(() => {
      const switched = calls.find((c) => c.path === "/api/projects/p2/stacks/web/branch-mapping");
      expect(switched).toBeDefined();
      expect(headerOf(switched, "X-Project-Id")).toBe("p2");
    });
  });
});
