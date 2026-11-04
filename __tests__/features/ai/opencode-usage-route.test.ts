import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ aggregate: vi.fn(), findOne: vi.fn(), connect: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: mocks.connect }))
vi.mock("@/lib/db/models/AiConsumption", () => ({ AiConsumption: { aggregate: mocks.aggregate, findOne: mocks.findOne } }))

import { GET } from "@/app/api/ai/providers/opencode/usage/route"

const chain = (doc: { createdAt: Date } | null) => ({
    sort: () => ({ select: () => ({ lean: async () => doc }) }),
})

beforeEach(() => {
    vi.clearAllMocks()
    mocks.findOne.mockReturnValue(chain(null))
    mocks.aggregate.mockResolvedValue([
        { _id: "agentic", requests: 2, inputTokens: 30, outputTokens: 10, totalTokens: 40, costUsd: 0.01, missingInput: 0, missingOutput: 0, missingTotal: 0, missingCost: 0 },
    ])
})

describe("GET /api/ai/providers/opencode/usage", () => {
    it("devolve rows (contrato do card compartilhado), não origins", async () => {
        const response = await GET(new NextRequest("http://localhost/api/ai/providers/opencode/usage"), { params: Promise.resolve({}) })
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.rows[0]).toMatchObject({ key: "agentic", label: "Desenvolvimento agêntico (mesas)", requests: 2, totalTokens: 40 })
        expect(body.data.rows[0].origin).toBeUndefined()
        expect(body.data.missingInputRequests).toBe(0)
        expect(body.data.missingOutputRequests).toBe(0)
    })

    it("período inválido não consulta o banco", async () => {
        const response = await GET(new NextRequest("http://localhost/api/ai/providers/opencode/usage?from=erro"), { params: Promise.resolve({}) })
        expect(response.status).toBe(400)
        expect(mocks.aggregate).not.toHaveBeenCalled()
    })
})
