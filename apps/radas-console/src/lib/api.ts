/**
 * Thin fetch wrapper for the OpenSible backend.
 * Platform responses use a `data` envelope; operation responses intentionally
 * keep their asynchronous payload in the top-level `operation` field.
 */
const TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";
const USER_KEY = "user_data";
const AUTH_CHANGED_EVENT = "radas-auth-changed";

function notifyAuthChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null, refreshToken?: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
  if (refreshToken !== undefined) {
    if (refreshToken) window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    else window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
  notifyAuthChanged();
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  notifyAuthChanged();
}

export function saveUser(user: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser<T = unknown>(): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export class ApiError extends Error {
  readonly code?: string;
  readonly details?: unknown;

  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    const error = body && typeof body === "object" && "error" in body
      ? (body as { error?: unknown }).error
      : undefined;
    if (error && typeof error === "object") {
      this.code = typeof (error as Record<string, unknown>).code === "string"
        ? (error as Record<string, unknown>).code as string
        : undefined;
      this.details = (error as Record<string, unknown>).details;
    }
    this.name = "ApiError";
  }
}

export function isForbidden(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 403;
}

/** Return the payload inside a standard successful platform response. */
export function unwrapData<T>(response: { data?: T } | T | null | undefined): T | undefined {
  if (response == null) return undefined;
  if (typeof response === "object" && response !== null && "data" in response) {
    return (response as { data?: T }).data;
  }
  return response as T;
}

/** Operation responses use the canonical `{operation, request_id}` envelope. */
export function unwrapOperation<T>(response: { operation?: T; data?: { operation?: T } } | T | null | undefined): T | undefined {
  if (response == null) return undefined;
  if (typeof response === "object" && response !== null && "operation" in response) {
    return (response as { operation?: T }).operation;
  }
  if (typeof response === "object" && response !== null && "data" in response) {
    const data = (response as { data?: { operation?: T } }).data;
    if (data && typeof data === "object" && "operation" in data) return data.operation;
  }
  return response as T;
}

export function stableFingerprint(value: unknown): string {
  const encoded = JSON.stringify(value, (_key, child) => {
    if (!child || typeof child !== "object" || Array.isArray(child)) return child;
    return Object.keys(child as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = (child as Record<string, unknown>)[key];
      return result;
    }, {});
  });
  let hash = 2166136261;
  for (let index = 0; index < encoded.length; index += 1) {
    hash ^= encoded.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createAttemptKey(scope: string, attempt: string): string {
  return `radas:${scope}:${attempt}`;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const token = getToken();
  const projectId = typeof window !== "undefined" ? window.localStorage.getItem("current_project_id") : null;
  const apiBase = typeof window !== "undefined" ? (import.meta.env.VITE_API_BASE ?? "") : "";
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(projectId ? { "X-Project-Id": projectId } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const realPath = projectId ? path.replace("/_current/", `/${encodeURIComponent(projectId)}/`) : path;
  const res = await fetch(apiBase + realPath, {
    ...init,
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (res.status === 401) {
    setToken(null);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) window.location.assign("/login");
    throw new ApiError(401, getErrorMessage(data, "Sesi berakhir. Silakan masuk kembali."), data);
  }
  if (!res.ok) throw new ApiError(res.status, getErrorMessage(data, res.statusText), data);
  return data as T;
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const nested = record.error;
    if (nested && typeof nested === "object") {
      const error = nested as Record<string, unknown>;
      for (const key of ["message", "detail", "error"]) {
        if (typeof error[key] === "string" && error[key]) return error[key] as string;
      }
      const details = error.details;
      if (details && typeof details === "object") {
        const detailRecord = details as Record<string, unknown>;
        if (typeof detailRecord.message === "string") return detailRecord.message;
        if (Array.isArray(detailRecord.errors)) {
          const messages = detailRecord.errors.map((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).message === "string" ? (item as Record<string, unknown>).message : null).filter(Boolean);
          if (messages.length) return messages.join(" ");
        }
      }
    }
    for (const key of ["message", "detail", "error"]) if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return typeof data === "string" && data ? data : fallback;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}
