import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * MFA page contract: status query, 403 state, not-enabled (empty) state,
 * enable→confirm enrollment with the TOTP secret only ever in the POST body,
 * in-place error recovery on an invalid code, and keyboard-confirmed disable.
 * The secret and codes must never appear in URLs or query keys.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/system/mfa" }),
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

import { MfaPage } from "./mfa";

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
      <MfaPage />
    </QueryClientProvider>,
  );
}

function headerOf(call: CapturedCall | undefined, name: string): string | null {
  return call ? new Headers(call.init.headers).get(name) : null;
}

const SECRET = "JBSWY3DPEHPK3PXP";
const OTPAUTH = `otpauth://totp/OpenSible:ops?secret=${SECRET}&issuer=OpenSible`;

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("auth_token", "token-1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MfaPage", () => {
  it("shows a loading state, then the not-enabled status with the enrollment entry point", async () => {
    const calls = installFetch((path) => {
      expect(path).toBe("/api/auth/mfa/status");
      return jsonResponse({ enabled: false });
    });
    renderPage(makeClient());

    expect(screen.getByRole("status")).toBeInTheDocument(); // loading state
    await waitFor(() => expect(screen.getByText("Not enabled")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Enable MFA" })).toBeInTheDocument();
    expect(headerOf(calls[0], "Authorization")).toBe("Bearer token-1");
  });

  it("renders the unauthorized state on 403", async () => {
    installFetch(() => jsonResponse({ error: "unauthorized" }, 403));
    renderPage(makeClient());

    await waitFor(() => expect(screen.getByText("Access denied (403)")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enable MFA" })).not.toBeInTheDocument();
  });

  it("enrolls via enable→confirm, sending the secret only in the POST body", async () => {
    const user = userEvent.setup();
    let confirmed = false;
    const calls = installFetch((path, init) => {
      if (path === "/api/auth/mfa/enable") {
        expect(init.method).toBe("POST");
        return jsonResponse({ success: true, secret: SECRET, otpauth_url: OTPAUTH });
      }
      if (path === "/api/auth/mfa/confirm") {
        confirmed = true;
        return jsonResponse({ success: true, message: "MFA enabled" });
      }
      return jsonResponse({ enabled: confirmed });
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByRole("button", { name: "Enable MFA" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Enable MFA" }));
    await waitFor(() => expect(screen.getByTestId("mfa-secret")).toHaveTextContent(SECRET));
    expect(screen.getByTestId("mfa-otpauth-url")).toHaveTextContent("otpauth://totp/");

    await user.type(screen.getByLabelText("Authenticator code"), "123456");
    // Keyboard flow: Enter inside the code field submits enrollment.
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText("Enabled")).toBeInTheDocument());
    const confirm = calls.find((c) => c.path === "/api/auth/mfa/confirm");
    expect(confirm).toBeTruthy();
    expect(JSON.parse(String(confirm?.init.body))).toEqual({ secret: SECRET, code: "123456" });
    expect(headerOf(confirm, "Idempotency-Key")).toBeTruthy();
    // No credential ever travels in a URL.
    for (const call of calls) {
      expect(call.path).not.toContain(SECRET);
      expect(call.path).not.toContain("123456");
    }
  });

  it("recovers in place when the first code is invalid", async () => {
    const user = userEvent.setup();
    let confirmCalls = 0;
    const calls = installFetch((path, init) => {
      if (path === "/api/auth/mfa/enable") {
        return jsonResponse({ success: true, secret: SECRET, otpauth_url: OTPAUTH });
      }
      if (path === "/api/auth/mfa/confirm") {
        confirmCalls += 1;
        if (confirmCalls === 1) return jsonResponse({ error: "Invalid code" }, 400);
        return jsonResponse({ success: true, message: "MFA enabled" });
      }
      return confirmCalls >= 1 ? jsonResponse({ enabled: true }) : jsonResponse({ enabled: false });
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByRole("button", { name: "Enable MFA" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Enable MFA" }));
    await waitFor(() => expect(screen.getByTestId("mfa-secret")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Authenticator code"), "000000");
    await user.click(screen.getByRole("button", { name: "Confirm enrollment" }));

    // Recovery: the enrollment panel survives the 400 so the user can retry.
    await waitFor(() => expect(confirmCalls).toBe(1));
    expect(screen.getByTestId("mfa-enrollment")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Authenticator code"), "123456");
    await user.click(screen.getByRole("button", { name: "Confirm enrollment" }));

    await waitFor(() => expect(screen.getByText("Enabled")).toBeInTheDocument());
    expect(confirmCalls).toBe(2);
    expect(calls.filter((c) => c.path === "/api/auth/mfa/confirm")).toHaveLength(2);
  });

  it("disables MFA through the confirm dialog only after typing a code", async () => {
    const user = userEvent.setup();
    let disabledDone = false;
    const calls = installFetch((path, init) => {
      if (path === "/api/auth/mfa/disable") {
        expect(init.method).toBe("POST");
        disabledDone = true;
        return jsonResponse({ success: true, message: "MFA disabled" });
      }
      return jsonResponse({ enabled: !disabledDone });
    });
    renderPage(makeClient());
    await waitFor(() => expect(screen.getByRole("button", { name: "Disable…" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Disable…" }));
    const confirm = screen.getByRole("button", { name: "Disable MFA" });
    expect(confirm).toBeDisabled(); // no code yet — dialog cannot confirm accidentally

    await user.type(screen.getByLabelText("Current authenticator code"), "654321");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(screen.getByText("Not enabled")).toBeInTheDocument());
    const disable = calls.find((c) => c.path === "/api/auth/mfa/disable");
    expect(JSON.parse(String(disable?.init.body))).toEqual({ code: "654321" });
    expect(headerOf(disable, "Idempotency-Key")).toBeTruthy();
    expect(disable?.path).not.toContain("654321");
  });
});
