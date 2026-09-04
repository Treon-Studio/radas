import { describe, expect, it, test, vi } from "vitest"
import { createRadasClient } from "../src/client"
import { createRadasTransport } from "../src/transport"

const okEnvelope = {
	success: true,
	data: { approvals: [] },
	meta: { requestId: "srv-1" },
}

function clientWith(fetchImpl: typeof globalThis.fetch) {
	return createRadasClient({ baseUrl: "https://radas.test/", token: "tok_1", fetch: fetchImpl })
}

describe("radas client", () => {
	it("sends bearer token, content type, and request id; returns success envelope", async () => {
		let captured: { url: string; init: RequestInit } | undefined
		const client = clientWith(async (input, init) => {
			captured = { url: String(input), init: init! }
			return new Response(JSON.stringify(okEnvelope), { status: 200 })
		})

		const result = await client.call("GET", "/api/v2/approvals", undefined, "req_fixed_1")

		expect(result).toEqual(okEnvelope)
		expect(captured!.url).toBe("https://radas.test/api/v2/approvals")
		expect((captured!.init.headers as Record<string, string>).Authorization).toBe("Bearer tok_1")
		expect((captured!.init.headers as Record<string, string>)["X-Request-Id"]).toBe("req_fixed_1")
	})

	it("throws RadasApiError carrying the contracts failure payload", async () => {
		const failure = {
			success: false,
			error: { code: "forbidden", message: "nope", retryable: false },
		}
		const client = clientWith(async () => new Response(JSON.stringify(failure), { status: 403 }))

		await expect(client.call("GET", "/api/v2/approvals")).rejects.toMatchObject({
			name: "RadasApiError",
			status: 403,
			payload: failure,
		})
	})

	it("generates a request id when the caller omits one", async () => {
		let captured: { init: RequestInit } | undefined
		const client = clientWith(async (_input, init) => {
			captured = { init: init! }
			return new Response(JSON.stringify(okEnvelope), { status: 200 })
		})

		await client.call("GET", "/api/v2/approvals")

		expect((captured!.init.headers as Record<string, string>)["X-Request-Id"]).toMatch(/^[0-9a-f-]{36}$/)
	})
})

test("transport injects bearer + request id and merges caller headers", async () => {
	let token = "tok_1"
	const calls: Array<{ input: string; init: RequestInit }> = []
	const transport = createRadasTransport({
		baseUrl: "https://radas.test",
		getToken: () => token,
		fetch: async (input, init) => {
			calls.push({ input: String(input), init: init! })
			return new Response(JSON.stringify({ success: true, data: { ok: 1 } }), { status: 200 })
		},
	})

	await transport("/api/v2/flags", { method: "GET", headers: { "X-Project-Id": "p1" } })

	const headers = calls[0]!.init.headers as Record<string, string>
	expect(calls[0]!.input).toBe("https://radas.test/api/v2/flags")
	expect(headers.Authorization).toBe("Bearer tok_1")
	expect(headers["X-Project-Id"]).toBe("p1")
	expect(headers["X-Request-Id"]).toMatch(/^[0-9a-zA-Z][0-9a-zA-Z_-]{7,127}$/)

	// Lazy: token change between calls is picked up without re-creating.
	token = "tok_2"
	await transport("/api/v2/flags", { method: "GET" })
	expect((calls[1]!.init.headers as Record<string, string>).Authorization).toBe("Bearer tok_2")
})

test("transport omits Authorization when getToken returns null", async () => {
	const calls: Array<{ init: RequestInit }> = []
	const transport = createRadasTransport({
		baseUrl: "",
		getToken: () => null,
		fetch: async (_input, init) => {
			calls.push({ init: init! })
			return new Response("{}", { status: 200 })
		},
	})

	await transport("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" } })

	const headers = calls[0]!.init.headers as Record<string, string>
	expect(headers.Authorization).toBeUndefined()
	expect(headers["X-Request-Id"]).toBeDefined()
})

test("transport resolves fetch lazily so a late global stub is used", async () => {
	const original = globalThis.fetch
	const seen: string[] = []
	try {
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			seen.push(String(input))
			return new Response("{}", { status: 200 })
		}) as typeof fetch
		// Created BEFORE the stub swap — must still route through it.
		const transport = createRadasTransport({ baseUrl: "https://x.test", getToken: () => "t" })
		await transport("/ping")
		expect(seen).toEqual(["https://x.test/ping"])
	} finally {
		globalThis.fetch = original
	}
})
