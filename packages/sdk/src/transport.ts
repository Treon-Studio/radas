/**
 * Minimal transport seam for consumers that own their own response/error
 * semantics (auth refresh, project scoping, envelope handling) but want the
 * SDK to own header construction: bearer auth, X-Request-Id, and header
 * merging. The console uses this instead of re-implementing headers.
 */
import { createApiClient } from "@treon-studio/api-client"

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
	const normalizedBase = options.baseUrl.replace(/\/+$/, "")
	const client = createApiClient({
		baseUrl: normalizedBase,
		getToken: options.getToken,
		fetch: options.fetch,
		envelope: "raw-response",
		maxAttempts: 1,
	})

	return async (path, init = {}) => {
		const { method = "GET", body, headers, signal, requestId, ...unsupported } = init
		void unsupported
		let apiBody: unknown = body
		if (typeof body === "string") {
			try {
				apiBody = JSON.parse(body)
			} catch {
				apiBody = body
			}
		}
		return client.call<Response>(method as Parameters<typeof client.call>[0], path, {
			body: apiBody,
			headers,
			signal: signal ?? undefined,
			requestId,
		})
	}
}
