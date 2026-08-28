import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Automation rules page contract: rule listing, 403 state, empty state and
 * create/toggle mutations carrying Idempotency-Key headers.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/system/automation" }),
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

import { AutomationPage } from "./automation";

type CapturedCall = { path: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(handler: (path: string, init: RequestInit) => Response) {
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
      <AutomationPage />
    </QueryClientProvider>,
  );
}

function headerOf(call: CapturedCall | undefined, name: string): string | null {
  return call ? new Headers(call.init.headers).get(name) : null;
}

const RULES = {
  rules: [
    { id: "r1", kind: "maintenance", enabled: true, stack: "web", start_hour: 1, end_hour: 5 },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("auth_token", "token-1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AutomationPage", () => {
  it("shows a loading state, then renders rules and maintenance status", async () => {
    const calls = installFetch((path) => {
      if (path === "/api/automation/maintenance") return jsonResponse({ active: false });
      if (path === "/api/automation/rules") return jsonResponse(RULES);
      return jsonResponse({});
    });
    renderPage(makeClient());

    expect(screen.getByRole("status")).toBeInTheDocument(); // loading state
    await waitFor(() => expect(screen.getByText("Maintenance inactive")).toBeInTheDocument());
    expect(screen.getByText("enabled")).toBeInTheDocument(); // rule status badge
    expect(headerOf(calls[0], "Authorization")).toBe("Bearer token-1");
  });

  it("renders the unauthorized state on 403", async () => {
    installFetch(() => jsonResponse({ error: "forbidden" }, 403));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("Access denied (403)")).toBeInTheDocument());
    expect(screen.queryByText("Maintenance inactive")).not.toBeInTheDocument();
  });

  it("renders the empty state when no rules exist", async () => {
    installFetch((path) => {
      if (path === "/api/automation/maintenance") return jsonResponse({ active: false });
      if (path === "/api/automation/rules") return jsonResponse({ rules: [] });
      return jsonResponse({});
    });
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("No automation rules")).toBeInTheDocument());
  });

  it("creates a rule with a POST, Idempotency-Key and the chosen kind", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if (path === "/api/automation/rules" && init.method === "POST") {
        return jsonResponse({ success: true, rule: { id: "r2", kind: "auto_stop", enabled: true } }, 201);
      }
      if (path === "/api/automation/maintenance") return jsonResponse({ active: false });
      if (path === "/api/automation/rules") return jsonResponse(RULES);
      return jsonResponse({});
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByText("Maintenance inactive")).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText("Rule kind"), "auto_stop");
    await user.type(screen.getByLabelText("Stack"), "web");
    await user.click(screen.getByRole("button", { name: /Add rule/ }));

    await waitFor(() => {
      const created = calls.find((c) => c.path === "/api/automation/rules" && c.init.method === "POST");
      expect(created).toBeDefined();
      expect(headerOf(created, "Idempotency-Key")).toBeTruthy();
      expect(JSON.parse(String(created?.init.body))).toEqual({
        kind: "auto_stop",
        stack: "web",
        enabled: true,
      });
    });
  });

  it("toggles a rule with PATCH and an Idempotency-Key", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if (path === "/api/automation/rules/r1" && init.method === "PATCH") {
        return jsonResponse({ success: true, rule: { id: "r1", kind: "maintenance", enabled: false } });
      }
      if (path === "/api/automation/maintenance") return jsonResponse({ active: false });
      if (path === "/api/automation/rules") return jsonResponse(RULES);
      return jsonResponse({});
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByText("Maintenance inactive")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() => {
      const patched = calls.find((c) => c.path === "/api/automation/rules/r1" && c.init.method === "PATCH");
      expect(patched).toBeDefined();
      expect(headerOf(patched, "Idempotency-Key")).toBeTruthy();
      expect(JSON.parse(String(patched?.init.body))).toEqual({ enabled: false });
    });
  });
});
