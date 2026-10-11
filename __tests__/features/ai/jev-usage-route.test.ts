import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ usage: vi.fn() }))
vi.mock("@/features/ai/server/jev-usage", () => ({ getJevUsage: mocks.usage }))

import { GET } from "@/app/api/ai/providers/jev/usage/route"
const call = (query = "") => GET(new NextRequest(`http://localhost/api/ai/providers/jev/usage${query}`), { params: Promise.resolve({}) })
beforeEach(() => vi.clearAllMocks())

describe("GET /api/ai/providers/jev/usage", () => {
    it("retorna consumo em ApiResponse, com períodos ISO opcionais", async () => {
        mocks.usage.mockResolvedValue({ requests: 149, totalTokens: 235088, costUsd: 0.0067 })
        const response = await call("?from=2026-10-10T00:00:00.000Z&to=2026-10-11T23:59:59.999Z")
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ success: true, data: { totalTokens: 235088, costUsd: 0.0067 } })
        expect(mocks.usage).toHaveBeenCalledWith({ from: "2026-10-10T00:00:00.000Z", to: "2026-10-11T23:59:59.999Z" })
    })

    it("data inválida ou intervalo invertido não consulta o banco", async () => {
        expect((await call("?from=erro")).status).toBe(400)
        expect((await call("?from=2026-10-12T00:00:00Z&to=2026-10-10T00:00:00Z")).status).toBe(400)
        expect(mocks.usage).not.toHaveBeenCalled()
    })
})
