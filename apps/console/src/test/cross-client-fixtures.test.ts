import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, getToken, setToken, unwrapData, unwrapOperation } from "../lib/api";
import fixtures from "../../../../contracts/cross-client-fixtures.json";

/**
 * Cross-client contract fixtures test (Task 6.2 of the 2026-08-27 console/CLI
 * integration plan).
 *
 * Two halves, mirroring apps/cli/internal/integration/cross_client_test.go:
 *
 *  1. Always-on fixture leg: drives lib/api.ts against a fetch stub whose
 *     responses are shaped by contracts/cross-client-fixtures.json (populated
 *     from the server reference half, apps/server/tests/
 *     test_cli_server_integration.py). Asserts the console client's request
 *     construction (method/path/headers/body keys) and envelope parsing
 *     (login envelope, legacy projects envelope, platform {data, request_id}
 *     envelope, {operation, data, request_id} operation envelope, structured
 *     {error: {code}} errors) match the recorded contract.
 *
 *  2. Env-gated real-HTTP leg: when VITEST_CROSS_CLIENT_URL,
 *     VITEST_CROSS_CLIENT_USERNAME, VITEST_CROSS_CLIENT_PASSWORD and
 *     VITEST_CROSS_CLIENT_PROJECT_NAME are set, the same login → projects read
 *     → services read → idempotent deploy mutation → replay/conflict flow runs
 *     against the LIVE server through lib/api.ts, so the TypeScript leg can be
 *     compared with the direct-HTTP and Go legs. When the variables are unset
 *     the suite skips cleanly (same gating as the Go contract tests), so
 *     `pnpm test` stays green on every checkout without a running server.
 *     Point the slug (VITEST_CROSS_CLIENT_CATALOG_SLUG, optional) at a
 *     harmless, non-production catalog definition; queued deploys stay queued.
 *
 * Failure messages and test names carry client=/domain=/endpoint= labels.
 * Tokens are stored in localStorage for the request path and are never
 * printed, logged, or embedded in assertion messages.
 */

type AnyRecord = Record<string, unknown>;

const ACCESS_TOKEN_FIXTURE = "contract-access-token";
const IDEMPOTENCY_KEY = "console-contract-key-1";
const PROJECT_ID = "proj-contract";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 || status === 201 || status === 202 ? "OK" : "Error",
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function installFetch(handler: (...args: Parameters<FetchMock>) => unknown): Promise<FetchMock> {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Secret-safe assertion: failures print a boolean, never the value itself. */
function expectSecretPresent(value: unknown): void {
  expect(typeof value === "string" && value.length > 0).toBe(true);
}

function lastCall(mock: FetchMock): { path: string; init: RequestInit & { headers: Record<string, string>; body?: string } } {
  const call = mock.mock.calls.at(-1) as [string, RequestInit];
  return {
    path: call[0],
    init: call[1] as RequestInit & { headers: Record<string, string>; body?: string },
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("client=ts cross-client contract fixtures (always-on, stubbed fetch)", () => {
  it("client=ts domain=contract: fixture file covers every step of the shared flow", () => {
    const steps = fixtures.steps as AnyRecord;
    for (const step of [
      "login",
      "projects_list",
      "services_list",
      "service_deploy",
      "idempotency_replay",
      "idempotency_conflict",
      "missing_idempotency_key",
      "scope_errors",
    ]) {
      expect(steps[step]).toBeDefined();
    }
    expect(fixtures.contract_version).toBe(1);
    expect(fixtures.parity.asserted_equivalences.length).toBeGreaterThan(0);
  });

  it("client=ts domain=auth endpoint=POST /api/auth/login: request shape and login envelope match the fixture", async () => {
    const step = fixtures.steps.login;
    const sample = step.response.sample;
    const fetchMock = await installFetch(() => jsonResponse(sample, 200));

    const body = await api<AnyRecord>("POST", "/api/auth/login", { username: "contract-user", password: "contract-pass" });

    const { path, init } = lastCall(fetchMock);
    expect(path).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe(step.request.content_type);
    expect(Object.keys(JSON.parse(init.body ?? "{}"))).toEqual(expect.arrayContaining(step.request.body_keys));

    expect(Object.keys(body)).toEqual(expect.arrayContaining(step.response.body_keys));
    expect(body.success).toBe(true);
    expectSecretPresent(body.access_token);
    expectSecretPresent(body.refresh_token);
    expect(Object.keys(body.user as AnyRecord)).toEqual(expect.arrayContaining(step.response.user_keys));
  });

  it("client=ts domain=projects endpoint=GET /api/projects: Bearer auth and legacy org-scoped envelope", async () => {
    setToken(ACCESS_TOKEN_FIXTURE);
    const step = fixtures.steps.projects_list;
    const sampleProject = step.response.sample.projects[0] as AnyRecord;
    const fetchMock = await installFetch(() =>
      jsonResponse({ success: true, projects: [sampleProject] }, 200),
    );

    const body = await api<AnyRecord>("GET", "/api/projects");

    const { path, init } = lastCall(fetchMock);
    expect(path).toBe("/api/projects");
    expect(init.method).toBe("GET");
    expect(init.headers["Authorization"]).toBe(`Bearer ${ACCESS_TOKEN_FIXTURE}`);
    expect(init.headers["Content-Type"]).toBeUndefined();

    expect(Object.keys(body)).toEqual(expect.arrayContaining(step.response.body_keys));
    expect(body.success).toBe(true);
    const project = (body.projects as AnyRecord[]).find((p) => p.id === sampleProject.id);
    expect(project).toBeDefined();
    // Project scope contract (server-enforced, mirrored here via the orgId
    // field the scope guarantee attaches to every listed project).
    expect(Object.keys(project as AnyRecord)).toEqual(expect.arrayContaining(step.response.project_keys));
    expect(project?.orgId).toBe(sampleProject.orgId);
  });

  it("client=ts domain=services endpoint=GET /api/projects/<pid>/services: platform envelope with request_id pairing", async () => {
    setToken(ACCESS_TOKEN_FIXTURE);
    const step = fixtures.steps.services_list;
    const requestId = "req-ts-services-list-1";
    const envelope = { data: { services: [] as AnyRecord[] }, request_id: requestId };
    const response = jsonResponse(envelope, 200, { "X-Request-ID": requestId });
    await installFetch(() => response);

    const body = await api<AnyRecord>("GET", `/api/projects/${PROJECT_ID}/services`);

    expect(Object.keys(body)).toEqual(expect.arrayContaining(step.response.body_keys));
    // Platform contract: request_id in the body AND the X-Request-ID header.
    expect(body.request_id).toBe(requestId);
    expect(response.headers.get("X-Request-ID")).toBe(body.request_id);
    // Envelope parsing: unwrapData returns the fixture-shaped services payload.
    const data = unwrapData<{ services: AnyRecord[] }>(body);
    expect(Object.keys(data as AnyRecord)).toEqual(expect.arrayContaining(step.response.data_keys));
    expect(data?.services).toEqual([]);
  });

  it("client=ts domain=services endpoint=POST /api/projects/<pid>/services: mutation request with Idempotency-Key and queued operation envelope", async () => {
    setToken(ACCESS_TOKEN_FIXTURE);
    const step = fixtures.steps.service_deploy;
    const payload = { ...step.request.sample };
    const operation = {
      id: "op-contract-1",
      kind: step.response.operation_values.kind,
      status: step.response.operation_values.status,
      instance_id: "inst-contract-1",
      poll_url: `/api/projects/${PROJECT_ID}/services/inst-contract-1/operations/op-contract-1`,
    };
    const envelope = { operation, data: { operation }, request_id: "req-ts-deploy-1" };
    const response = jsonResponse(envelope, 202, { "X-Request-ID": envelope.request_id });
    const fetchMock = await installFetch(() => response);

    const body = await api<AnyRecord>(
      "POST",
      `/api/projects/${PROJECT_ID}/services`,
      payload,
      { headers: { "Idempotency-Key": IDEMPOTENCY_KEY } },
    );

    const { path, init } = lastCall(fetchMock);
    expect(path).toBe(`/api/projects/${PROJECT_ID}/services`);
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe(IDEMPOTENCY_KEY);
    expect(init.headers["Content-Type"]).toBe(step.request.headers["Content-Type"]);
    expect(Object.keys(JSON.parse(init.body ?? "{}"))).toEqual(expect.arrayContaining(step.request.body_keys));

    expect(Object.keys(body)).toEqual(expect.arrayContaining(step.response.body_keys));
    const op = unwrapOperation<AnyRecord>(body) as AnyRecord;
    expect(Object.keys(operation)).toEqual(expect.arrayContaining(step.response.operation_keys));
    expect(op.id).toBe(operation.id);
    expect(op.kind).toBe(step.response.operation_values.kind);
    expect(op.status).toBe(step.response.operation_values.status);
    expect(body.request_id).toBe(envelope.request_id);
    expect(response.headers.get("X-Request-ID")).toBe(body.request_id);
  });

  it("client=ts domain=services endpoint=POST /api/projects/<pid>/services (replay): same key + identical body keeps the operation id", async () => {
    setToken(ACCESS_TOKEN_FIXTURE);
    const step = fixtures.steps.idempotency_replay;
    const payload = { ...fixtures.steps.service_deploy.request.sample };
    const operation = { id: "op-contract-1", kind: "service.deploy", status: "queued", instance_id: "inst-contract-1" };
    const envelope = { operation, data: { operation }, request_id: "req-ts-replay-1" };
    let calls = 0;
    const fetchMock = await installFetch(() => {
      calls += 1;
      return jsonResponse(envelope, 202, { "X-Request-ID": envelope.request_id });
    });

    const request = () =>
      api<AnyRecord>(`POST`, `/api/projects/${PROJECT_ID}/services`, payload, {
        headers: { "Idempotency-Key": IDEMPOTENCY_KEY },
      });
    const first = await request();
    const replayed = await request();

    expect(calls).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Idempotency replay contract: the replayed envelope equals the original
    // verbatim — same operation id, same instance_id, same request_id.
    const firstOp = unwrapOperation<AnyRecord>(first) as AnyRecord;
    const replayedOp = unwrapOperation<AnyRecord>(replayed) as AnyRecord;
    expect(Object.keys(firstOp)).toEqual(expect.arrayContaining(step.response.operation_keys));
    expect(replayedOp.id).toBe(firstOp.id);
    expect(replayedOp.instance_id).toBe(firstOp.instance_id);
    expect(replayed.request_id).toBe(first.request_id);
  });

  it("client=ts domain=services endpoint=POST /api/projects/<pid>/services (conflict): reused key + different body surfaces the fixture 409 code", async () => {
    setToken(ACCESS_TOKEN_FIXTURE);
    const step = fixtures.steps.idempotency_conflict;
    const envelope = {
      error: { code: "CONFLICT", message: "Idempotency-Key reused with a different payload", details: {} },
      request_id: "req-ts-conflict-1",
    };
    await installFetch(() => jsonResponse(envelope, 409, { "X-Request-ID": envelope.request_id }));

    const payload = { ...fixtures.steps.service_deploy.request.sample, name: "a-different-service" };
    const promise = api<AnyRecord>("POST", `/api/projects/${PROJECT_ID}/services`, payload, {
      headers: { "Idempotency-Key": IDEMPOTENCY_KEY },
    });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    try {
      await promise;
      expect.unreachable("conflict replay must reject");
    } catch (error) {
      const err = error as ApiError;
      expect(err.status).toBe(step.response.status);
      expect(step.response.error_codes as string[]).toContain(err.code);
    }
  });

  it("client=ts domain=services endpoint=POST /api/projects/<pid>/services (missing key): 400 with the fixture validation code", async () => {
    setToken(ACCESS_TOKEN_FIXTURE);
    const step = fixtures.steps.missing_idempotency_key;
    const envelope = {
      error: { code: "SERVICE_VALIDATION_FAILED", message: "Idempotency-Key is required", details: {} },
      request_id: "req-ts-nokey-1",
    };
    await installFetch(() => jsonResponse(envelope, 400, { "X-Request-ID": envelope.request_id }));

    const payload = { ...fixtures.steps.service_deploy.request.sample };
    const promise = api<AnyRecord>("POST", `/api/projects/${PROJECT_ID}/services`, payload);
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    try {
      await promise;
      expect.unreachable("a deploy without an Idempotency-Key must reject");
    } catch (error) {
      const err = error as ApiError;
      expect(err.status).toBe(step.response.status);
      expect(step.response.error_codes as string[]).toContain(err.code);
    }
  });

  it("client=ts domain=services endpoint=GET /api/projects/<pid>/services (scope errors): 401/403 carry the platform error envelope", async () => {
    const unauthorized = fixtures.steps.scope_errors.cases[0]!.response;
    const forbidden = fixtures.steps.scope_errors.cases[1]!.response;
    setToken(ACCESS_TOKEN_FIXTURE);
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign, pathname: "/dashboard" },
    });

    // 401 UNAUTHORIZED on the platform namespace (lib/api tears the session
    // down and redirects to /login, mirroring its 401 handling contract).
    await installFetch(() =>
      jsonResponse(
        { error: { code: "UNAUTHORIZED", message: "unauthorized", details: {} }, request_id: "req-ts-401" },
        unauthorized.status,
        { "X-Request-ID": "req-ts-401" },
      ),
    );
    const unauthorizedPromise = api<AnyRecord>("GET", `/api/projects/${PROJECT_ID}/services`);
    await expect(unauthorizedPromise).rejects.toBeInstanceOf(ApiError);
    try {
      await unauthorizedPromise;
      expect.unreachable("an expired session must reject");
    } catch (error) {
      const err = error as ApiError;
      expect(err.status).toBe(unauthorized.status);
      expect(unauthorized.error_codes as string[]).toContain(err.code);
    }
    expect(assign).toHaveBeenCalledWith("/login");

    // 403 FORBIDDEN for a project outside the user's orgs (no existence leak).
    await installFetch(() =>
      jsonResponse(
        { error: { code: "FORBIDDEN", message: "Project access denied", details: {} }, request_id: "req-ts-403" },
        forbidden.status,
        { "X-Request-ID": "req-ts-403" },
      ),
    );
    const forbiddenPromise = api<AnyRecord>("GET", "/api/projects/proj-foreign/services");
    await expect(forbiddenPromise).rejects.toBeInstanceOf(ApiError);
    try {
      await forbiddenPromise;
      expect.unreachable("a foreign project must reject");
    } catch (error) {
      const err = error as ApiError;
      expect(err.status).toBe(forbidden.status);
      expect(forbidden.error_codes as string[]).toContain(err.code);
    }
  });
});

// ---------------------------------------------------------------------------
// Env-gated real-HTTP leg (client=ts against the live server). Skipped unless
// the four required VITEST_CROSS_CLIENT_* variables are set — the same gating
// contract as the Go half in apps/cli/internal/integration/. Run it via
// scripts/run-cross-client-contracts.sh (mode b).
// ---------------------------------------------------------------------------

const REAL_ENV = {
  url: process.env.VITEST_CROSS_CLIENT_URL,
  username: process.env.VITEST_CROSS_CLIENT_USERNAME,
  password: process.env.VITEST_CROSS_CLIENT_PASSWORD,
  projectName: process.env.VITEST_CROSS_CLIENT_PROJECT_NAME,
  slug: process.env.VITEST_CROSS_CLIENT_CATALOG_SLUG,
  version: process.env.VITEST_CROSS_CLIENT_CATALOG_VERSION ?? "1.0.0",
};

const realConfig =
  REAL_ENV.url && REAL_ENV.username && REAL_ENV.password && REAL_ENV.projectName
    ? {
        url: REAL_ENV.url.replace(/\/+$/, ""),
        username: REAL_ENV.username,
        password: REAL_ENV.password,
        projectName: REAL_ENV.projectName,
        slug: REAL_ENV.slug,
        version: REAL_ENV.version,
      }
    : null;

describe.skipIf(!realConfig)(
  "client=ts (real HTTP) cross-client parity — skipped unless VITEST_CROSS_CLIENT_URL/_USERNAME/_PASSWORD/_PROJECT_NAME are set",
  () => {
    interface OperationEnvelope {
      operation?: AnyRecord;
      request_id?: string;
    }

    it("client=ts domain=auth endpoint=POST /api/auth/login: live login yields the fixture envelope and stores tokens", async () => {
      if (!realConfig) return;
      const step = fixtures.steps.login;
      const body = await api<AnyRecord>("POST", `${realConfig.url}/api/auth/login`, {
        username: realConfig.username,
        password: realConfig.password,
      });
      expect(Object.keys(body)).toEqual(expect.arrayContaining(step.response.body_keys));
      expect(body.success).toBe(true);
      expectSecretPresent(body.access_token);
      expectSecretPresent(body.refresh_token);
      setToken(body.access_token as string, body.refresh_token as string);
      expect(getToken()).toBeTruthy();
    });

    it("client=ts domain=projects endpoint=GET /api/projects: live org-scoped list contains the configured project", async () => {
      if (!realConfig) return;
      const step = fixtures.steps.projects_list;
      const body = await api<AnyRecord>("GET", `${realConfig.url}/api/projects`);
      expect(Object.keys(body)).toEqual(expect.arrayContaining(step.response.body_keys));
      expect(body.success).toBe(true);
      const project = (body.projects as AnyRecord[]).find((p) => p.name === realConfig.projectName);
      expect(project, `client=ts domain=projects: project ${realConfig.projectName} not found in the org-scoped list`).toBeDefined();
      // Project scope: the listed project carries the org scoping field.
      expectSecretPresent(project?.orgId);
    });

    it("client=ts domain=services endpoint=GET /api/projects/<pid>/services: live platform envelope pairs request_id with X-Request-ID", async () => {
      if (!realConfig) return;
      const step = fixtures.steps.services_list;
      const list = await api<AnyRecord>("GET", `${realConfig.url}/api/projects`);
      const project = (list.projects as AnyRecord[]).find((p) => p.name === realConfig.projectName);
      if (!project) throw new Error(`client=ts domain=projects: project ${realConfig.projectName} not found`);

      const body = await api<AnyRecord>("GET", `${realConfig.url}/api/projects/${project.id}/services`);
      expect(Object.keys(body)).toEqual(expect.arrayContaining(step.response.body_keys));
      expectSecretPresent(body.request_id);

      // lib/api.ts does not expose response headers, so the header pairing is
      // asserted with one direct fetch of the same endpoint (client=ts
      // direct-HTTP sub-leg).
      const raw = await fetch(`${realConfig.url}/api/projects/${project.id}/services`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}`, Accept: "application/json" },
      });
      expect(raw.status).toBe(step.response.status);
      const rawBody = (await raw.json()) as { request_id?: string };
      expect(rawBody.request_id).toBeTruthy();
      expect(rawBody.request_id === raw.headers.get("X-Request-ID")).toBe(true);
    });

    it("client=ts domain=services endpoint=POST /api/projects/<pid>/services: live idempotent deploy, replay keeps the operation id", async () => {
      if (!realConfig) return;
      if (!realConfig.slug) {
        console.log(
          "client=ts: VITEST_CROSS_CLIENT_CATALOG_SLUG unset — mutation/replay assertions skipped (read-only parity)",
        );
        return;
      }
      const deployStep = fixtures.steps.service_deploy;
      const replayStep = fixtures.steps.idempotency_replay;
      const list = await api<AnyRecord>("GET", `${realConfig.url}/api/projects`);
      const project = (list.projects as AnyRecord[]).find((p) => p.name === realConfig.projectName);
      if (!project) throw new Error(`client=ts domain=projects: project ${realConfig.projectName} not found`);

      const payload = {
        ...deployStep.request.sample,
        name: `console-contract-${Date.now()}`,
        catalog_slug: realConfig.slug,
        catalog_version: realConfig.version,
      };
      const idempotencyKey = `console-contract-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const mutate = (body: unknown) =>
        api<OperationEnvelope>("POST", `${realConfig.url}/api/projects/${project.id}/services`, body, {
          headers: { "Idempotency-Key": idempotencyKey },
        });

      const created = await mutate(payload);
      expect(Object.keys(created)).toEqual(expect.arrayContaining(deployStep.response.body_keys));
      const op = unwrapOperation<AnyRecord>(created) as AnyRecord;
      expect(op.id).toBeTruthy();
      expect(op.kind).toBe(deployStep.response.operation_values.kind);
      expect(op.status).toBe(deployStep.response.operation_values.status);

      const replayed = await mutate(payload);
      const replayedOp = unwrapOperation<AnyRecord>(replayed) as AnyRecord;
      expect(Object.keys(replayedOp)).toEqual(expect.arrayContaining(replayStep.response.operation_keys));
      expect(replayedOp.id === op.id).toBe(true);
      expect(replayed.request_id === created.request_id).toBe(true);

      const other = { ...payload, name: `${payload.name}-other`, spec: { mode: "fast" } };
      const conflict = mutate(other);
      await expect(conflict).rejects.toBeInstanceOf(ApiError);
      try {
        await conflict;
        expect.unreachable("client=ts domain=services: key reuse with a different body must conflict");
      } catch (error) {
        const err = error as ApiError;
        expect(err.status).toBe(fixtures.steps.idempotency_conflict.response.status);
        expect(fixtures.steps.idempotency_conflict.response.error_codes as string[]).toContain(err.code);
      }
    });
  },
);
