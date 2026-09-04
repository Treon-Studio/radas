/**
 * Minimal transport seam for consumers that own their own response/error
 * semantics (auth refresh, project scoping, envelope handling) but want the
 * SDK to own header construction: bearer auth, X-Request-Id, and header
 * merging. The console uses this instead of re-implementing headers.
 */
export interface RadasTransportInit extends Omit<RequestInit, "headers"> {
	headers?: Record<string, string>
	/** Reuse a caller-provided request id; generated otherwise. */
	requestId?: string
}

export interface RadasTransportOptions {
	/** Absolute base (no trailing slash); "" for same-origin. */
	baseUrl: string
	/** Lazy token lookup so refresh flows never need a new transport. */
	getToken: () => string | null | undefined
	/** Defaults to globalThis.fetch, resolved per call (test-stubbable). */
	fetch?: typeof globalThis.fetch
}

export type RadasTransport = (
	path: string,
	init: RadasTransportInit,
) => Promise<Response>;

export function createRadasTransport(options: RadasTransportOptions): RadasTransport {
	const { baseUrl, getToken } = options
	const normalizedBase = baseUrl.replace(/\/+$/, "")

	return async (path, init = {}) => {
		const token = getToken()
		const headers: Record<string, string> = { ...(init.headers ?? {}) }
		if (token) headers.Authorization = `Bearer ${token}`
		// Reuse a well-formed caller id; generate a 32-hex id otherwise
		// (same contract as @treon-studio/observability, kept inline so the
		// SDK stays dependency-lean).
		const rid = init.requestId
		headers["X-Request-Id"] =
			typeof rid === "string" && /^[0-9a-zA-Z][0-9a-zA-Z_-]{7,127}$/.test(rid)
				? rid
				: crypto.randomUUID()

		const fetchImpl = options.fetch ?? globalThis.fetch
		return fetchImpl(`${normalizedBase}${path}`, {
			...init,
			headers,
		} as RequestInit)
	}
}
