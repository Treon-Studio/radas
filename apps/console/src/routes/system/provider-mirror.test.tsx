import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Provider mirror page contract: config GET with auth headers, 403/empty
 * states, PUT save with Idempotency-Key, and the keyboard-confirmed reset.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/system/provider-mirror" }),
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

import { ProviderMirrorPage } from "./provider-mirror";

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
      <ProviderMirrorPage />
    </QueryClientProvider>,
  );
}

function headerOf(call: CapturedCall | undefined, name: string): string | null {
  return call ? new Headers(call.init.headers).get(name) : null;
}

const TFRC = JSON.stringify(
  { provider_installation: [{ filesystem_mirror: { path: "/srv/tofu-providers" }, direct: {} }] },
  null,
  2,
);

const MIRRORED = {
  mirror: { enabled: true, dir: "/srv/tofu-providers", updated_at: 1_720_000_000 },
  registry_tfrc: TFRC,
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("auth_token", "token-1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProviderMirrorPage", () => {
  it("shows a loading state, then renders the mirror config and tfrc snippet", async () => {
    const calls = installFetch((path) => {
      expect(path).toBe("/api/settings/provider-mirror");
      return jsonResponse(MIRRORED);
    });
    renderPage(makeClient());

    expect(screen.getByRole("status")).toBeInTheDocument(); // loading state
    await waitFor(() => expect(screen.getByLabelText("Mirror directory")).toHaveValue("/srv/tofu-providers"));
    expect(screen.getByRole("switch", { name: "Mirror enabled" })).toBeChecked();
    expect(screen.getByTestId("registry-tfrc")).toHaveTextContent("filesystem_mirror");
    expect(headerOf(calls[0], "Authorization")).toBe("Bearer token-1");
  });

  it("renders the unauthorized state on 403", async () => {
    installFetch(() => jsonResponse({ error: "unauthorized" }, 403));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("Access denied (403)")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("renders the empty state when the mirror is unconfigured", async () => {
    installFetch(() => jsonResponse({ mirror: { enabled: false, dir: "" }, registry_tfrc: "" }));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("Provider mirror not configured")).toBeInTheDocument());
    expect(screen.queryByTestId("registry-tfrc")).not.toBeInTheDocument();
  });

  it("saves via PUT with the mirror payload and Idempotency-Key, then refetches", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if ((init.method ?? "GET") === "PUT") {
        return jsonResponse({ success: true, ...MIRRORED });
      }
      return jsonResponse(MIRRORED);
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByLabelText("Mirror directory")).toHaveValue("/srv/tofu-providers"));

    await user.clear(screen.getByLabelText("Mirror directory"));
    await user.type(screen.getByLabelText("Mirror directory"), "/mnt/mirror");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByLabelText("Mirror directory")).toHaveValue("/mnt/mirror"));
    const put = calls.find((c) => (c.init.method ?? "") === "PUT");
    expect(put?.path).toBe("/api/settings/provider-mirror");
    expect(headerOf(put, "Idempotency-Key")).toBeTruthy();
    expect(JSON.parse(String(put?.init.body))).toEqual({ dir: "/mnt/mirror", enabled: true });
    await waitFor(() => {
      const gets = calls.filter((c) => c.path === "/api/settings/provider-mirror" && (c.init.method ?? "GET") === "GET");
      expect(gets.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("resets the mirror through the confirm dialog using the keyboard", async () => {
    const user = userEvent.setup();
    const calls = installFetch((path, init) => {
      if ((init.method ?? "GET") === "DELETE") return jsonResponse({ success: true });
      return jsonResponse(MIRRORED);
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByLabelText("Mirror directory")).toHaveValue("/srv/tofu-providers"));

    await user.click(screen.getByRole("button", { name: "Reset…" }));
    const confirm = screen.getByRole("button", { name: "Reset mirror" });
    await waitFor(() => expect(confirm).toHaveFocus());
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const del = calls.find((c) => (c.init.method ?? "") === "DELETE");
      expect(del?.path).toBe("/api/settings/provider-mirror");
      expect(headerOf(del, "Idempotency-Key")).toBeTruthy();
    });
  });
});
