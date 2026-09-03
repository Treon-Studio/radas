import { describe, expect, it, vi } from "vitest"
import { createRadasClient } from "../src/client"

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
