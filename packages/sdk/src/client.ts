import createClient from "openapi-fetch"
import type { paths } from "./generated/schema.js"
import { isApiFailure, type ApiFailure } from "@treon-studio/contracts"

export type RadasPaths = paths

export interface RadasClientOptions {
	baseUrl: string
	token: string
	/** Caller-supplied correlation id; auto-generated when omitted. */
	requestId?: string
	fetch?: typeof globalThis.fetch
}

export class RadasApiError extends Error {
	readonly status: number
	readonly payload: ApiFailure | null

	constructor(status: number, payload: ApiFailure | null) {
		super(payload?.error.message ?? `Radas request failed (${status})`)
		this.name = "RadasApiError"
		this.status = status
		this.payload = payload
	}
}

export function createRadasClient(options: RadasClientOptions) {
	const { baseUrl, token, fetch: fetchImpl = globalThis.fetch } = options
	const normalizedBase = baseUrl.replace(/\/+$/, "")

	const client = createClient<RadasPaths>({ baseUrl: normalizedBase, fetch: fetchImpl })


	return {
		/** Raw typed client from openapi-fetch. */
		core: client,
		/** One-shot request helper: injects auth + request id, normalizes failures to RadasApiError. */
		async call<T>(method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT", path: string, body?: unknown, requestId?: string): Promise<T> {
			const rid = requestId ?? options.requestId ?? crypto.randomUUID()
			const response = await fetchImpl(`${normalizedBase}${path}`, {
				method,
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
					"X-Request-Id": rid,
				},
				body: body === undefined ? undefined : JSON.stringify(body),
			})
			const parsed = (await response.json().catch(() => undefined)) as unknown
			if (!response.ok || isApiFailure(parsed)) {
				throw new RadasApiError(response.status, isApiFailure(parsed) ? parsed : null)
			}
			return parsed as T
		},
	}
}
