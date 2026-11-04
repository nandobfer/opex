import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ usage: vi.fn() }))
vi.mock("@/features/ai/server/provider-usage", () => ({ getProviderUsage: mocks.usage }))

import { GET } from "@/app/api/ai/providers/[provider]/usage/route"

const call = (provider: string, query = "") =>
    GET(new NextRequest(`http://localhost/api/ai/providers/${provider}/usage${query}`), { params: Promise.resolve({ provider }) })

beforeEach(() => vi.clearAllMocks())

describe("GET /api/ai/providers/[provider]/usage", () => {
    it("retorna o consumo do provedor direto em ApiResponse, com períodos ISO opcionais", async () => {
        mocks.usage.mockResolvedValue({ rows: [], total: { requests: 0, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null } })
        const response = await call("gemini", "?from=2026-10-10T00:00:00.000Z&to=2026-10-11T23:59:59.999Z")
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ success: true, data: { rows: [] } })
        expect(mocks.usage).toHaveBeenCalledWith("gemini", { from: "2026-10-10T00:00:00.000Z", to: "2026-10-11T23:59:59.999Z" })
    })

    it("OpenCode, JEV e provedor desconhecido não consultam o banco", async () => {
        for (const provider of ["opencode", "jev", "desconhecido"]) expect((await call(provider)).status).toBe(404)
        expect(mocks.usage).not.toHaveBeenCalled()
    })

    it("data inválida ou intervalo invertido não consulta o banco", async () => {
        expect((await call("anthropic", "?from=erro")).status).toBe(400)
        expect((await call("openai", "?from=2026-10-12T00:00:00Z&to=2026-10-10T00:00:00Z")).status).toBe(400)
        expect(mocks.usage).not.toHaveBeenCalled()
    })
})
