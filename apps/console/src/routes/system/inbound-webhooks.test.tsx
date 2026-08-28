import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Inbound webhooks page contract: list redacts secrets, 403/empty states,
 * create mutation with Idempotency-Key, and the secret never rendering.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/system/inbound-webhooks" }),
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

import { InboundWebhooksPage } from "./inbound-webhooks";

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
      <InboundWebhooksPage />
    </QueryClientProvider>,
  );
}

function headerOf(call: CapturedCall | undefined, name: string): string | null {
  return call ? new Headers(call.init.headers).get(name) : null;
}

// The server redacts `secret`; a legacy/buggy server might leak it — the page
// must never render it either way.
const HOOKS = {
  inbound_webhooks: [
    {
      id: "w1",
      name: "deploy-main",
      stack: "web",
      action: "plan",
      project_id: "p1",
      secret: "LIST-LEAKED-SECRET-SHOULD-NOT-RENDER",
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

describe("InboundWebhooksPage", () => {
  it("shows a loading state, then lists webhooks without any secret", async () => {
    const calls = installFetch((path) => {
      expect(path).toBe("/api/inbound-webhooks");
      return jsonResponse(HOOKS);
    });
    const { container } = renderPage(makeClient());

    expect(screen.getByRole("status")).toBeInTheDocument(); // loading state
    await waitFor(() => expect(screen.getByText("deploy-main")).toBeInTheDocument());
    expect(screen.getByText(/POST \/api\/webhooks\/inbound\/deploy-main/)).toBeInTheDocument();
    expect(container.textContent).not.toContain("LIST-LEAKED-SECRET-SHOULD-NOT-RENDER");
    expect(headerOf(calls[0], "X-Project-Id")).toBe("p1");
  });

  it("renders the unauthorized state on 403", async () => {
    installFetch(() => jsonResponse({ success: false, error: "Project access denied" }, 403));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("Access denied (403)")).toBeInTheDocument());
    expect(screen.queryByText("deploy-main")).not.toBeInTheDocument();
  });

  it("renders the empty state when no webhooks exist", async () => {
    installFetch(() => jsonResponse({ inbound_webhooks: [] }));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("No inbound webhooks")).toBeInTheDocument());
  });

  it("renders the no-project empty state without a selected project", async () => {
    window.localStorage.removeItem("current_project_id");
    const calls = installFetch(() => jsonResponse(HOOKS));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("No project selected")).toBeInTheDocument());
    expect(calls).toHaveLength(0);
  });

  it("creates a webhook with an Idempotency-Key and never renders the returned secret", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if (path === "/api/inbound-webhooks" && init.method === "POST") {
        // Even a server bug returning the secret must not leak into the DOM.
        return jsonResponse(
          { success: true, inbound_webhook: { id: "w2", name: "deploy-x", stack: "web", action: "apply", secret: "CREATE-LEAKED-SECRET" } },
          201,
        );
      }
      return jsonResponse(HOOKS);
    });
    const { container } = renderPage(makeClient());
    await waitFor(() => expect(screen.getByText("deploy-main")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Webhook name"), "deploy-x");
    await user.type(screen.getByLabelText("Webhook stack"), "web");
    await user.selectOptions(screen.getByLabelText("Webhook action"), "apply");
    await user.type(screen.getByLabelText("Webhook secret"), "hmac-secret-1");
    await user.click(screen.getByRole("button", { name: /Create webhook/ }));

    await waitFor(() => {
      const created = calls.find((c) => c.path === "/api/inbound-webhooks" && c.init.method === "POST");
      expect(created).toBeDefined();
      expect(headerOf(created, "Idempotency-Key")).toBeTruthy();
      expect(JSON.parse(String(created?.init.body))).toEqual({
        name: "deploy-x",
        stack: "web",
        action: "apply",
        project_id: "p1",
        secret: "hmac-secret-1",
      });
    });
    expect(container.textContent).not.toContain("CREATE-LEAKED-SECRET");
  });

  it("rejects a create without name/stack without hitting the server", async () => {
    const user = userEvent.setup();
    const calls = installFetch(() => jsonResponse(HOOKS));
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByText("deploy-main")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Create webhook/ }));

    expect(calls.find((c) => c.init.method === "POST")).toBeUndefined();
  });
});
