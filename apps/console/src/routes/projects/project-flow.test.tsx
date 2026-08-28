import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/query";
import { getCurrentProjectId, ProjectProvider, useProjects } from "@/lib/project";

/**
 * Contract tests for the project context: selection persistence, switch
 * request with tenant headers, and cache invalidation on switch.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PROJECTS = [
  { id: "p1", name: "Alpha" },
  { id: "p2", name: "Beta" },
];

type CapturedCall = { path: string; init: RequestInit };

function installFetch(): { fetchMock: ReturnType<typeof vi.fn>; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(input);
    // api() may pass relative URLs; new URL() would throw on them in Node.
    const url = raw.startsWith("http") ? new URL(raw) : null;
    const path = (url ? url.pathname : raw).split("?")[0] ?? raw;
    calls.push({ path, init: init ?? {} });
    if (path === "/api/projects" && (init?.method ?? "GET") === "GET") {
      return Promise.resolve(jsonResponse({ projects: PROJECTS }));
    }
    if (/^\/api\/projects\/[^/]+\/switch$/.test(path)) {
      return Promise.resolve(jsonResponse({ success: true, project: { id: path.split("/")[3] } }));
    }
    if (path === "/api/projects" && init?.method === "POST") {
      return Promise.resolve(jsonResponse({ project: { id: "p3", name: "Gamma", description: "new" } }, 201));
    }
    return Promise.resolve(jsonResponse({ success: true }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function getCaptured(calls: CapturedCall[], path: string) {
  return calls.find((c) => c.path === path);
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  queryClient.clear();
});

describe("ProjectProvider selection flow", () => {
  it("setCurrent persists the selection, calls the switch endpoint with tenant headers, and invalidates queries", async () => {
    window.localStorage.setItem("auth_token", "token-1");
    const { fetchMock, calls } = installFetch();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useProjects(), { wrapper: ProjectProvider });

    await waitFor(() => expect(result.current.projects).toHaveLength(2));
    invalidateSpy.mockClear();

    await act(async () => {
      await result.current.setCurrent("p2");
    });

    expect(getCurrentProjectId()).toBe("p2");
    expect(result.current.currentId).toBe("p2");
    expect(result.current.current?.name).toBe("Beta");

    const switchCall = getCaptured(calls, "/api/projects/p2/switch");
    expect(switchCall).toBeDefined();
    expect(switchCall?.init.method).toBe("POST");
    const headers = new Headers(switchCall?.init.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-1");
    expect(headers.get("X-Project-Id")).toBe("p2");

    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("setCurrent(null) clears the selection without calling the switch endpoint", async () => {
    window.localStorage.setItem("auth_token", "token-1");
    window.localStorage.setItem("current_project_id", "p1");
    const { fetchMock, calls } = installFetch();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useProjects(), { wrapper: ProjectProvider });
    await waitFor(() => expect(result.current.projects).toHaveLength(2));
    invalidateSpy.mockClear();

    await act(async () => {
      await result.current.setCurrent(null);
    });

    expect(getCurrentProjectId()).toBeNull();
    expect(result.current.currentId).toBeNull();
    expect(calls.some((c) => c.path.includes("/switch"))).toBe(false);
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("reload drops a stored selection that no longer matches the project list", async () => {
    window.localStorage.setItem("auth_token", "token-1");
    window.localStorage.setItem("current_project_id", "gone");
    installFetch();

    const { result } = renderHook(() => useProjects(), { wrapper: ProjectProvider });

    await waitFor(() => expect(result.current.projects).toHaveLength(2));
    expect(result.current.currentId).toBeNull();
    expect(getCurrentProjectId()).toBeNull();
  });

  it("reload clears everything when there is no token", async () => {
    window.localStorage.setItem("current_project_id", "p1");
    const { fetchMock, calls } = installFetch();

    const { result } = renderHook(() => useProjects(), { wrapper: ProjectProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.projects).toEqual([]);
    expect(result.current.currentId).toBeNull();
    expect(getCurrentProjectId()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("createProject posts the payload, reloads, and selects the new project", async () => {
    window.localStorage.setItem("auth_token", "token-1");
    const { fetchMock, calls } = installFetch();

    const { result } = renderHook(() => useProjects(), { wrapper: ProjectProvider });
    await waitFor(() => expect(result.current.projects).toHaveLength(2));

    let created: { id: string; name: string } | undefined;
    await act(async () => {
      created = await result.current.createProject({ name: "Gamma", description: "new" });
    });

    expect(created?.id).toBe("p3");
    const createCall = calls.find((c) => c.path === "/api/projects" && c.init.method === "POST");
    expect(createCall).toBeDefined();
    expect(JSON.parse(String(createCall?.init.body))).toEqual({ name: "Gamma", description: "new" });
    expect(getCurrentProjectId()).toBe("p3");
  });
});

// Keep the shared QueryClient import referenced so the spy target is the
// exact singleton the provider uses (typed, not a mock module swap).
void (queryClient as unknown as QueryClient);
