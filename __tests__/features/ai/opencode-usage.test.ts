import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ aggregate: vi.fn(), findOne: vi.fn(), connect: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: mocks.connect }))
vi.mock("@/lib/db/models/AiConsumption", () => ({ AiConsumption: { aggregate: mocks.aggregate, findOne: mocks.findOne } }))

import { aiConsumptionOriginLabel, formatUsd, opencodeUsageQuerySchema, opencodeUsageRangeQuery } from "@/features/ai/opencode-usage"
import { getOpencodeUsage } from "@/features/ai/server/opencode-usage"

const chain = (doc: { createdAt: Date } | null) => ({
    sort: () => ({ select: () => ({ lean: async () => doc }) }),
})

beforeEach(() => {
    vi.clearAllMocks()
    mocks.findOne.mockReturnValue(chain(null))
})

describe("consumo do OpenCode por origem", () => {
    it("agrupa por origem no período e devolve o total, com filtro só do OpenCode", async () => {
        mocks.aggregate.mockResolvedValue([
            { _id: "agentic", requests: 3, inputTokens: 300, outputTokens: 100, totalTokens: 450, costUsd: 0.01, missingInput: 0, missingOutput: 0, missingTotal: 0, missingCost: 0 },
            { _id: "refinement", requests: 1, inputTokens: 50, outputTokens: 10, totalTokens: 60, costUsd: 0.002, missingInput: 0, missingOutput: 0, missingTotal: 0, missingCost: 0 },
        ])
        const query = { from: "2026-10-10T03:00:00.000Z", to: "2026-10-11T02:59:59.999Z" }
        const result = await getOpencodeUsage(query)
        expect(result.origins.map((row) => row.origin)).toEqual(["agentic", "refinement"])
        expect(result.origins[0]).toMatchObject({ label: "Desenvolvimento agêntico (mesas)", requests: 3, totalTokens: 450 })
        expect(result.total).toMatchObject({ requests: 4, inputTokens: 350, outputTokens: 110, totalTokens: 510, costUsd: 0.012 })
        expect(mocks.aggregate.mock.calls[0]![0][0]).toEqual({ $match: { provider: "opencode", createdAt: { $gte: new Date(query.from), $lte: new Date(query.to) } } })
    })

    it("métrica desconhecida em toda a origem vira null (não zero); o total ignora as desconhecidas", async () => {
        mocks.aggregate.mockResolvedValue([
            { _id: "task-summary", requests: 2, inputTokens: 0, outputTokens: 0, totalTokens: 200, costUsd: 0, missingInput: 2, missingOutput: 2, missingTotal: 0, missingCost: 2 },
            { _id: "agentic", requests: 1, inputTokens: 30, outputTokens: 5, totalTokens: 35, costUsd: 0.001, missingInput: 0, missingOutput: 0, missingTotal: 0, missingCost: 0 },
        ])
        const result = await getOpencodeUsage({})
        expect(result.origins[0]).toMatchObject({ inputTokens: null, outputTokens: null, totalTokens: 200, costUsd: null })
        expect(result.total).toMatchObject({ inputTokens: 30, outputTokens: 5, totalTokens: 235, costUsd: 0.001 })
    })

    it("sem registros: listas vazias, total zerado e sem cobertura", async () => {
        mocks.aggregate.mockResolvedValue([])
        const result = await getOpencodeUsage({})
        expect(result.origins).toEqual([])
        expect(result.total).toEqual({ requests: 0, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null })
        expect(result.coverageFrom).toBeNull()
    })

    it("informa o início da cobertura a partir do registro mais antigo", async () => {
        mocks.aggregate.mockResolvedValue([])
        mocks.findOne.mockReturnValue(chain({ createdAt: new Date("2026-10-12T12:00:00.000Z") }))
        const result = await getOpencodeUsage({})
        expect(result.coverageFrom).toBe("2026-10-12T12:00:00.000Z")
    })

    it("converte calendário local incluindo todo o dia final e rejeita períodos inválidos", () => {
        const range = opencodeUsageRangeQuery("2026-10-10", "2026-10-11")!
        expect(new Date(range.from!).getHours()).toBe(0)
        expect(new Date(range.to!).getHours()).toBe(23)
        expect(opencodeUsageRangeQuery("2026-10-12", "2026-10-10")).toBeNull()
        expect(opencodeUsageRangeQuery("not-a-date", "")).toBeNull()
        expect(opencodeUsageRangeQuery("", "")).toEqual({ from: undefined, to: undefined })
        expect(opencodeUsageQuerySchema.safeParse({ from: "inválida" }).success).toBe(false)
    })

    it("rotula as origens conhecidas e formata o custo com precisão", () => {
        expect(aiConsumptionOriginLabel("agentic")).toBe("Desenvolvimento agêntico (mesas)")
        expect(aiConsumptionOriginLabel("refinement")).toBe("Refinar tarefa")
        expect(aiConsumptionOriginLabel("desconhecida")).toBe("desconhecida")
        expect(formatUsd(0.000000042)).toContain("0,000000042")
    })
})
