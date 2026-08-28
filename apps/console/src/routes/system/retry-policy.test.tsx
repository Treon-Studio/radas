import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Retry policy page contract: project-scoped policy fetch, 403 state,
 * no-project empty state, save mutation with Idempotency-Key, and sweep.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/system/retry-policy" }),
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

import { RetryPolicyPage } from "./retry-policy";

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
      <RetryPolicyPage />
    </QueryClientProvider>,
  );
}

function headerOf(call: CapturedCall | undefined, name: string): string | null {
  return call ? new Headers(call.init.headers).get(name) : null;
}

const POLICY = { retry_policy: { max_retries: 2, backoff_seconds: 600 } };

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("auth_token", "token-1");
  window.localStorage.setItem("current_project_id", "p1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RetryPolicyPage", () => {
  it("shows a loading state, then renders the project policy", async () => {
    const calls = installFetch((path) => {
      expect(path).toBe("/api/retry-policy/p1");
      return jsonResponse(POLICY);
    });
    renderPage(makeClient());

    expect(screen.getByRole("status")).toBeInTheDocument(); // loading state
    await waitFor(() => expect(screen.getByText(/current: 2 retries \/ 600s backoff/)).toBeInTheDocument());
    expect(headerOf(calls[0], "X-Project-Id")).toBe("p1");
    expect(headerOf(calls[0], "Authorization")).toBe("Bearer token-1");
  });

  it("renders the unauthorized state on 403", async () => {
    installFetch(() => jsonResponse({ success: false, error: "Project access denied" }, 403));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("Access denied (403)")).toBeInTheDocument());
    expect(screen.queryByText(/current:/)).not.toBeInTheDocument();
  });

  it("renders the no-project empty state without a selected project", async () => {
    window.localStorage.removeItem("current_project_id");
    const calls = installFetch(() => jsonResponse(POLICY));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("No project selected")).toBeInTheDocument());
    expect(calls).toHaveLength(0);
  });

  it("saves the policy with a PUT, Idempotency-Key and validated values", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if (path === "/api/retry-policy/p1" && init.method === "PUT") {
        return jsonResponse({ success: true, retry_policy: { max_retries: 3, backoff_seconds: 600 } });
      }
      if (path === "/api/retry-policy/sweep") return jsonResponse({ retried: 0, skipped_backoff: 0 });
      return jsonResponse(POLICY);
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByText(/current: 2 retries/)).toBeInTheDocument());

    const retries = screen.getByLabelText("Max retries") as HTMLInputElement;
    await user.clear(retries);
    await user.type(retries, "3");
    await user.click(screen.getByRole("button", { name: "Save policy" }));

    await waitFor(() => {
      const saved = calls.find((c) => c.path === "/api/retry-policy/p1" && c.init.method === "PUT");
      expect(saved).toBeDefined();
      expect(headerOf(saved, "Idempotency-Key")).toBeTruthy();
      expect(headerOf(saved, "X-Project-Id")).toBe("p1");
      expect(JSON.parse(String(saved?.init.body))).toEqual({ max_retries: 3, backoff_seconds: 600 });
    });
  });

  it("rejects invalid policy values without hitting the server", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if (path === "/api/retry-policy/p1" && init.method === "PUT") {
        return jsonResponse({ success: true });
      }
      return jsonResponse(POLICY);
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByText(/current: 2 retries/)).toBeInTheDocument());

    const retries = screen.getByLabelText("Max retries") as HTMLInputElement;
    await user.clear(retries);
    await user.type(retries, "99");
    await user.click(screen.getByRole("button", { name: "Save policy" }));

    expect(calls.find((c) => c.init.method === "PUT")).toBeUndefined();
  });

  it("runs the sweep with a POST and an Idempotency-Key", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if (path === "/api/retry-policy/sweep") return jsonResponse({ retried: 2, skipped_backoff: 1 });
      return jsonResponse(POLICY);
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByText(/current: 2 retries/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Run sweep/ }));

    await waitFor(() => {
      const sweep = calls.find((c) => c.path === "/api/retry-policy/sweep");
      expect(sweep).toBeDefined();
      expect(sweep?.init.method).toBe("POST");
      expect(headerOf(sweep, "Idempotency-Key")).toBeTruthy();
    });
  });
});
