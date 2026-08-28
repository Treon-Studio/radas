import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  api,
  getToken,
  setToken,
  unwrapData,
  unwrapOperation,
} from "./api";

/**
 * Contract tests for the fetch wrapper in lib/api.ts.
 * These pin the exact wire behaviour of the console against the OpenSible
 * backend: `data` envelope, `{operation, request_id}` envelope,
 * `{error: {code, message, details}}` errors, 401 session teardown,
 * Bearer auth, X-Project-Id propagation and header passthrough.
 */

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200, statusText = ""): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    statusText: statusText || (status === 200 ? "OK" : "Error"),
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, { status, headers: { "Content-Type": "text/plain" } });
}

async function installFetch(handler: (...args: Parameters<FetchMock>) => unknown): Promise<FetchMock> {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("envelope unwrapping", () => {
  it("unwrapData returns the payload inside a {data} envelope", () => {
    expect(unwrapData({ data: { id: "p1" } })).toEqual({ id: "p1" });
    expect(unwrapData({ data: [1, 2] })).toEqual([1, 2]);
  });

  it("unwrapData passes through payloads without a data envelope", () => {
    expect(unwrapData({ id: "p1" })).toEqual({ id: "p1" });
    expect(unwrapData([1, 2])).toEqual([1, 2]);
    expect(unwrapData(null)).toBeUndefined();
    expect(unwrapData(undefined)).toBeUndefined();
  });

  it("unwrapOperation returns the top-level operation payload", () => {
    const op = { id: "op-1", status: "running" };
    expect(unwrapOperation({ operation: op, request_id: "r1" })).toEqual(op);
  });

  it("unwrapOperation unwraps a nested data.operation envelope", () => {
    const op = { id: "op-2", status: "done" };
    expect(unwrapOperation({ data: { operation: op } })).toEqual(op);
  });

  it("unwrapOperation passes through non-envelope responses", () => {
    expect(unwrapOperation({ ok: true })).toEqual({ ok: true });
    expect(unwrapOperation(null)).toBeUndefined();
  });
});

describe("api() success responses", () => {
  it("returns the parsed JSON body as-is (caller unwraps the envelope)", async () => {
    const body = { data: { projects: [{ id: "p1" }] }, request_id: "abc" };
    const fetchMock = await installFetch(() => jsonResponse(body));
    await expect(api("GET", "/api/projects")).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves with null for an empty body", async () => {
    await installFetch(() => new Response(null, { status: 204 }));
    await expect(api("GET", "/api/health")).resolves.toBeNull();
  });

  it("falls back to raw text when the body is not JSON", async () => {
    await installFetch(() => textResponse("gateway timeout", 200));
    await expect(api("GET", "/api/whatever")).resolves.toBe("gateway timeout");
  });
});

describe("api() request headers", () => {
  it("sends a Bearer token from localStorage auth_token", async () => {
    setToken("tok-123");
    const fetchMock = await installFetch(() => jsonResponse({}));
    await api("GET", "/api/auth/me");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer tok-123" }),
      }),
    );
  });

  it("omits the Authorization header when no token is stored", async () => {
    const fetchMock = await installFetch(() => jsonResponse({}));
    await api("GET", "/api/auth/me");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(getToken()).toBeNull();
  });

  it("propagates X-Project-Id from current_project_id and rewrites /_current/ paths", async () => {
    window.localStorage.setItem("current_project_id", "proj-42");
    const fetchMock = await installFetch(() => jsonResponse({}));
    await api("GET", "/api/projects/_current/stacks");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/proj-42/stacks",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Project-Id": "proj-42" }),
      }),
    );
  });

  it("leaves the path and headers alone without a selected project", async () => {
    const fetchMock = await installFetch(() => jsonResponse({}));
    await api("GET", "/api/projects/_current/stacks");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/_current/stacks",
      expect.objectContaining({
        headers: expect.not.objectContaining({ "X-Project-Id": expect.anything() }),
      }),
    );
  });

  it("forwards an Idempotency-Key header from init.headers", async () => {
    const fetchMock = await installFetch(() => jsonResponse({}));
    await api("POST", "/api/projects/p1/deploy", { env: "prod" }, {
      headers: { "Idempotency-Key": "idem-001" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p1/deploy",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "idem-001",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ env: "prod" }),
      }),
    );
  });

  it("omits Content-Type for bodiless requests", async () => {
    const fetchMock = await installFetch(() => jsonResponse({}));
    await api("GET", "/api/projects");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });
});

describe("api() structured error parsing", () => {
  it("parses {error:{code,message,details}} into ApiError", async () => {
    const errorBody = {
      error: {
        code: "PROJECT_NOT_FOUND",
        message: "Project does not exist",
        details: { project_id: "p-x" },
      },
    };
    await installFetch(() => jsonResponse(errorBody, 404));
    const promise = api("GET", "/api/projects/p-x");
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    try {
      await api("GET", "/api/projects/p-x");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.status).toBe(404);
      expect(err.message).toBe("Project does not exist");
      expect(err.code).toBe("PROJECT_NOT_FOUND");
      expect(err.details).toEqual({ project_id: "p-x" });
    }
  });

  it("falls back to flat message/detail fields", async () => {
    await installFetch(() => jsonResponse({ message: "flat failure" }, 500));
    await expect(api("GET", "/api/x")).rejects.toMatchObject({
      status: 500,
      message: "flat failure",
    });
  });

  it("uses the HTTP status text when the body carries no message", async () => {
    await installFetch(() => new Response(null, { status: 502, statusText: "Bad Gateway" }));
    await expect(api("GET", "/api/x")).rejects.toMatchObject({
      status: 502,
      message: "Bad Gateway",
    });
  });

  it("surfaces validation messages nested in error.details.errors", async () => {
    const body = {
      error: {
        code: "VALIDATION_FAILED",
        details: { errors: [{ message: "name is required" }, { message: "env is invalid" }] },
      },
    };
    await installFetch(() => jsonResponse(body, 422));
    await expect(api("POST", "/api/projects", {})).rejects.toMatchObject({
      status: 422,
      message: "name is required env is invalid",
    });
  });
});

describe("api() 401 handling", () => {
  it("clears the stored token, redirects to /login and throws ApiError(401)", async () => {
    setToken("expired-token");
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign, pathname: "/dashboard" },
    });
    await installFetch(() =>
      jsonResponse({ error: { code: "UNAUTHORIZED", message: "token expired" } }, 401),
    );

    const promise = api("GET", "/api/projects");
    await expect(promise).rejects.toMatchObject({
      status: 401,
      message: "token expired",
    });
    // Exact behaviour pinned from api(): only the auth_token is cleared by
    // setToken(null) (other keys are left for clearSession), the app is
    // redirected to /login, and the ApiError still carries the body.
    expect(window.localStorage.getItem("auth_token")).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("uses the default Indonesian session-expired message when the body is empty", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: vi.fn(), pathname: "/dashboard" },
    });
    await installFetch(() => new Response(null, { status: 401 }));
    await expect(api("GET", "/api/projects")).rejects.toMatchObject({
      status: 401,
      message: "Sesi berakhir. Silakan masuk kembali.",
    });
  });

  it("does not redirect when already on /login", async () => {
    setToken("expired-token");
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign, pathname: "/login" },
    });
    await installFetch(() => jsonResponse({ error: { message: "expired" } }, 401));
    await expect(api("GET", "/api/projects")).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("auth_token")).toBeNull();
  });
});
