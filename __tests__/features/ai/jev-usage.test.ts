import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ aggregate: vi.fn(), connect: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: mocks.connect }))
vi.mock("@/lib/db/models/Ai", () => ({ AiUsageLog: { aggregate: mocks.aggregate } }))

import { formatJevCost, jevUsageQuerySchema, jevUsageRangeQuery } from "@/features/ai/jev-usage"
import { getJevUsage } from "@/features/ai/server/jev-usage"

beforeEach(() => vi.clearAllMocks())

describe("consumo JEV por período", () => {
    it("filtra só JEV, em limites ISO inclusivos, retornando as somas conhecidas", async () => {
        mocks.aggregate.mockResolvedValue([{ requests: 2, failedRequests: 1, inputTokens: 100, outputTokens: 20, totalTokens: 120, costUsd: 0.0000042, reconstructedRequests: 0, missingInput: 1, missingOutput: 1, missingTokenRequests: 1, missingCostRequests: 1 }])
        const query = { from: "2026-10-10T03:00:00.000Z", to: "2026-10-11T02:59:59.999Z" }
        expect(await getJevUsage(query)).toMatchObject({ requests: 2, failedRequests: 1, totalTokens: 120, costUsd: 0.0000042, missingTokenRequests: 1, missingCostRequests: 1 })
        expect(mocks.aggregate.mock.calls[0]![0][0]).toEqual({ $match: { provider: "jev", createdAt: { $gte: new Date(query.from), $lte: new Date(query.to) } } })
    })

    it("histórico exibe total e custo, mas mantém entrada e saída desconhecidos", async () => {
        mocks.aggregate.mockResolvedValue([{ requests: 149, failedRequests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 235088, costUsd: 0.0067, reconstructedRequests: 149, missingInput: 149, missingOutput: 149, missingTokenRequests: 0, missingCostRequests: 0 }])
        expect(await getJevUsage({})).toMatchObject({ inputTokens: null, outputTokens: null, totalTokens: 235088, costUsd: 0.0067, reconstructedRequests: 149 })
        expect(mocks.aggregate.mock.calls[0]![0][0]).toEqual({ $match: { provider: "jev" } })
    })

    it("chamadas todas sem métricas retornam null, diferente de período vazio", async () => {
        mocks.aggregate.mockResolvedValueOnce([{ requests: 1, failedRequests: 1, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, reconstructedRequests: 0, missingInput: 1, missingOutput: 1, missingTokenRequests: 1, missingCostRequests: 1 }])
        expect(await getJevUsage({})).toMatchObject({ requests: 1, totalTokens: null, costUsd: null })
        mocks.aggregate.mockResolvedValueOnce([])
        expect(await getJevUsage({})).toMatchObject({ requests: 0, totalTokens: 0, costUsd: 0 })
    })

    it("converte calendário local incluindo todo o dia final e rejeita períodos inválidos", () => {
        const range = jevUsageRangeQuery("2026-10-10", "2026-10-11")!
        expect(new Date(range.from!).getHours()).toBe(0)
        expect(new Date(range.to!).getHours()).toBe(23)
        expect(new Date(range.to!).getMilliseconds()).toBe(999)
        expect(jevUsageRangeQuery("2026-10-12", "2026-10-10")).toBeNull()
        expect(jevUsageRangeQuery("not-a-date", "")).toBeNull()
        expect(jevUsageRangeQuery("2026-02-31", "")).toBeNull()
        expect(jevUsageRangeQuery("", "")).toEqual({ from: undefined, to: undefined })
        expect(jevUsageQuerySchema.safeParse({ from: "inválida" }).success).toBe(false)
    })

    it("formata custo histórico e custos pequenos sem reduzi-los a zero", () => {
        expect(formatJevCost(0.0067)).toContain("0,0067")
        expect(formatJevCost(0.000000042)).toContain("0,000000042")
    })
})
