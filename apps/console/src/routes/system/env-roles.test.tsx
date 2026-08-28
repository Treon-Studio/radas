import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Environment roles page contract: project-scoped GET with tenant headers,
 * 403/empty states, PUT save with Idempotency-Key, and the confirmation dialog
 * required when saving removes restrictions for previously configured
 * environments.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/system/env-roles" }),
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

import { EnvRolesPage } from "./env-roles";

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
      <EnvRolesPage />
    </QueryClientProvider>,
  );
}

function headerOf(call: CapturedCall | undefined, name: string): string | null {
  return call ? new Headers(call.init.headers).get(name) : null;
}

const MAPPING = { env_roles: { prod: ["admin", "deployer"], staging: ["developer"] } };

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("auth_token", "token-1");
  window.localStorage.setItem("current_project_id", "p1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EnvRolesPage", () => {
  it("shows a loading state, then renders the configured mapping with tenant headers", async () => {
    const calls = installFetch((path) => {
      expect(path).toBe("/api/env-roles/_current");
      return jsonResponse(MAPPING);
    });
    renderPage(makeClient());

    expect(screen.getByRole("status")).toBeInTheDocument(); // loading state
    await waitFor(() => expect(screen.getByLabelText("Environment for row 1")).toHaveValue("prod"));
    expect(screen.getByLabelText("Allowed roles for row 1")).toHaveValue("admin, deployer");
    expect(screen.getByLabelText("Allowed roles for row 2")).toHaveValue("developer");
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

  it("renders the empty state when no environment is restricted", async () => {
    installFetch(() => jsonResponse({ env_roles: {} }));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("No environment restrictions")).toBeInTheDocument());
  });

  it("saves via PUT with the parsed mapping and Idempotency-Key", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if ((init.method ?? "GET") === "PUT") {
        return jsonResponse({ success: true, env_roles: { prod: ["admin"] } });
      }
      return jsonResponse({ env_roles: {} });
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByRole("button", { name: "Add environment" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Add environment" }));
    await user.type(screen.getByLabelText("Environment for row 1"), "prod");
    await user.type(screen.getByLabelText("Allowed roles for row 1"), "admin, deployer, admin");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const put = calls.find((c) => (c.init.method ?? "") === "PUT");
      expect(put?.path).toBe("/api/env-roles/_current");
      expect(headerOf(put, "Idempotency-Key")).toBeTruthy();
      expect(headerOf(put, "X-Project-Id")).toBe("p1");
      // Duplicates removed, roles trimmed.
      expect(JSON.parse(String(put?.init.body))).toEqual({ env_roles: { prod: ["admin", "deployer"] } });
    });
  });

  it("asks for confirmation before saving a mapping that removes a restriction", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if ((init.method ?? "GET") === "PUT") return jsonResponse({ success: true, env_roles: { prod: ["admin"] } });
      return jsonResponse(MAPPING);
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByLabelText("Environment for row 2")).toHaveValue("staging"));

    // Remove the staging row, then save — this drops a configured environment.
    await user.click(screen.getByRole("button", { name: "Remove row 2" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Dialog appears; the PUT must not fire before it is confirmed.
    expect(screen.getByRole("dialog", { name: "Remove environment restrictions" })).toBeInTheDocument();
    expect(calls.find((c) => (c.init.method ?? "") === "PUT")).toBeUndefined();

    await user.click(screen.getByRole("button", { name: "Save and remove" }));

    await waitFor(() => {
      const put = calls.find((c) => (c.init.method ?? "") === "PUT");
      expect(JSON.parse(String(put?.init.body))).toEqual({ env_roles: { prod: ["admin", "deployer"] } });
    });
  });
});
