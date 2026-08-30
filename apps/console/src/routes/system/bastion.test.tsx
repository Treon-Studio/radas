import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Bastion page contract: project-scoped GET with tenant headers, 403/empty
 * states, PUT save with Idempotency-Key, and the keyboard-confirmed delete.
 * The SSH key path must never travel in a URL — only in the request body.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/system/bastion" }),
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

import { BastionPage } from "./bastion";

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
    calls.push({ path, init: init ?? {} });
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
      <BastionPage />
    </QueryClientProvider>,
  );
}

function headerOf(call: CapturedCall | undefined, name: string): string | null {
  return call ? new Headers(call.init.headers).get(name) : null;
}

const CONFIGURED = {
  configured: true,
  bastion: { host: "bastion.example.com", user: "ops", port: 2222, ssh_key: "~/.ssh/bastion_ed25519" },
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

describe("BastionPage", () => {
  it("shows a loading state, then renders the stored config with tenant headers", async () => {
    const calls = installFetch((path) => {
      expect(path).toBe("/api/bastion/p1");
      return jsonResponse(CONFIGURED);
    });
    renderPage(makeClient());

    expect(screen.getByRole("status")).toBeInTheDocument(); // loading state
    await waitFor(() => expect(screen.getByLabelText("Bastion host")).toHaveValue("bastion.example.com"));
    expect(screen.getByLabelText("Bastion user")).toHaveValue("ops");
    expect(screen.getByLabelText("Bastion port")).toHaveValue(2222);
    expect(calls[0]?.path).not.toContain("ssh_key");
    expect(headerOf(calls[0], "X-Project-Id")).toBe("p1");
    expect(headerOf(calls[0], "Authorization")).toBe("Bearer token-1");
  });

  it("renders the unauthorized state on 403 (no project access)", async () => {
    installFetch(() => jsonResponse({ error: "project access denied" }, 403));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("Access denied (403)")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("renders the empty state when no bastion is configured", async () => {
    installFetch(() => jsonResponse({ configured: false, bastion: {} }));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("Bastion not configured")).toBeInTheDocument());
  });

  it("renders a server-error state with retry on 500, and recovers on retry", async () => {
    let failing = true;
    installFetch(() => (failing
      ? jsonResponse({ error: "boom" }, 500)
      : jsonResponse(CONFIGURED)));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText(/Server error/)).toBeInTheDocument());
    failing = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "TRY AGAIN" }));
    await waitFor(() => expect(screen.getByLabelText("Bastion host")).toHaveValue("bastion.example.com"));
  });

  it("saves via PUT with the SSH key in the body only, plus Idempotency-Key", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if ((init.method ?? "GET") === "PUT") {
        return jsonResponse({ success: true, bastion: { ...CONFIGURED.bastion, host: "jump.example.com" } });
      }
      return jsonResponse(CONFIGURED);
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByLabelText("Bastion host")).toHaveValue("bastion.example.com"));

    await user.clear(screen.getByLabelText("Bastion host"));
    await user.type(screen.getByLabelText("Bastion host"), "jump.example.com");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByLabelText("Bastion host")).toHaveValue("jump.example.com"));
    const put = calls.find((c) => (c.init.method ?? "") === "PUT");
    expect(put?.path).toBe("/api/bastion/p1");
    expect(put?.path).not.toContain("ssh_key");
    expect(headerOf(put, "Idempotency-Key")).toBeTruthy();
    expect(headerOf(put, "X-Project-Id")).toBe("p1");
    expect(JSON.parse(String(put?.init.body))).toEqual({
      host: "jump.example.com",
      user: "ops",
      port: 2222,
      ssh_key: "~/.ssh/bastion_ed25519",
    });
  });

  it("removes the bastion through the confirm dialog using the keyboard", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if ((init.method ?? "GET") === "DELETE") return jsonResponse({ success: true });
      return jsonResponse(CONFIGURED);
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByLabelText("Bastion host")).toHaveValue("bastion.example.com"));

    await user.click(screen.getByRole("button", { name: "Remove…" }));
    const confirm = screen.getByRole("button", { name: "Remove bastion" });
    await waitFor(() => expect(confirm).toHaveFocus());
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const del = calls.find((c) => (c.init.method ?? "") === "DELETE");
      expect(del?.path).toBe("/api/bastion/p1");
      expect(headerOf(del, "Idempotency-Key")).toBeTruthy();
    });
  });
});
