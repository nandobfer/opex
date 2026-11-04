import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ aggregate: vi.fn(), findOne: vi.fn(), connect: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: mocks.connect }))
vi.mock("@/lib/db/models/AiConsumption", () => ({ AiConsumption: { aggregate: mocks.aggregate, findOne: mocks.findOne } }))

import { formatTokensCompact, isUsageProviderId, usageRangeQuery } from "@/features/ai/provider-usage"
import { getProviderUsage } from "@/features/ai/server/provider-usage"

const chain = (doc: { createdAt: Date } | null) => ({
    sort: () => ({ select: () => ({ lean: async () => doc }) }),
})

beforeEach(() => {
    vi.clearAllMocks()
    mocks.findOne.mockReturnValue(chain(null))
})

describe("consumo dos provedores diretos por recurso", () => {
    it("agrupa por recurso no período e devolve o total, com filtro do provedor", async () => {
        mocks.aggregate.mockResolvedValue([
            { _id: "task-summary", requests: 3, inputTokens: 3000, outputTokens: 1000, totalTokens: 4500, costUsd: 0, missingInput: 0, missingOutput: 0, missingTotal: 0, missingCost: 3 },
            { _id: "budget-preview", requests: 1, inputTokens: 500, outputTokens: 100, totalTokens: 600, costUsd: 0, missingInput: 0, missingOutput: 0, missingTotal: 0, missingCost: 1 },
        ])
        const query = { from: "2026-10-10T03:00:00.000Z", to: "2026-10-11T02:59:59.999Z" }
        const result = await getProviderUsage("gemini", query)
        expect(result.rows.map((row) => row.key)).toEqual(["task-summary", "budget-preview"])
        expect(result.rows[0]).toMatchObject({ label: "Resumos de tarefas", requests: 3, totalTokens: 4500 })
        expect(result.total).toMatchObject({ requests: 4, inputTokens: 3500, outputTokens: 1100, totalTokens: 5100, costUsd: null })
        expect(result.missingInputRequests).toBe(0)
        expect(result.missingOutputRequests).toBe(0)
        expect(result.missingTokenRequests).toBe(0)
        expect(result.missingCostRequests).toBe(4)
        expect(mocks.aggregate.mock.calls[0]![0][0]).toEqual({ $match: { provider: "gemini", createdAt: { $gte: new Date(query.from), $lte: new Date(query.to) } } })
        expect(mocks.findOne).toHaveBeenCalledWith({ provider: "gemini" })
    })

    it("métrica desconhecida em todo o recurso vira null (não zero); o total ignora as desconhecidas", async () => {
        mocks.aggregate.mockResolvedValue([
            { _id: "task-summary", requests: 2, inputTokens: 0, outputTokens: 0, totalTokens: 200, costUsd: 0, missingInput: 2, missingOutput: 2, missingTotal: 0, missingCost: 2 },
            { _id: "budget-preview", requests: 1, inputTokens: 30, outputTokens: 5, totalTokens: 35, costUsd: 0, missingInput: 0, missingOutput: 0, missingTotal: 0, missingCost: 0 },
        ])
        const result = await getProviderUsage("anthropic", {})
        expect(result.rows[0]).toMatchObject({ inputTokens: null, outputTokens: null, totalTokens: 200, costUsd: null })
        expect(result.total).toMatchObject({ inputTokens: 30, outputTokens: 5, totalTokens: 235, costUsd: 0 })
        expect(result.missingInputRequests).toBe(2)
        expect(result.missingOutputRequests).toBe(2)
        expect(result.missingTokenRequests).toBe(0)
    })

    it("sinaliza somas parciais de entrada e saída quando só parte dos registros informa a métrica", async () => {
        mocks.aggregate.mockResolvedValue([
            { _id: "task-summary", requests: 10, inputTokens: 600, outputTokens: 600, totalTokens: 1200, costUsd: 0, missingInput: 3, missingOutput: 4, missingTotal: 0, missingCost: 10 },
        ])
        const result = await getProviderUsage("anthropic", {})
        // A soma dos registros conhecidos não é apresentada como medição completa.
        expect(result.rows[0]).toMatchObject({ inputTokens: 600, outputTokens: 600 })
        expect(result.missingInputRequests).toBe(3)
        expect(result.missingOutputRequests).toBe(4)
    })

    it("sem registros: lista vazia, total zerado e sem cobertura", async () => {
        mocks.aggregate.mockResolvedValue([])
        const result = await getProviderUsage("openai", {})
        expect(result.rows).toEqual([])
        expect(result.total).toEqual({ requests: 0, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null })
        expect(result.coverageFrom).toBeNull()
        expect(result.missingInputRequests).toBe(0)
        expect(result.missingOutputRequests).toBe(0)
        expect(result.missingTokenRequests).toBe(0)
        expect(result.missingCostRequests).toBe(0)
    })

    it("informa o início da cobertura a partir do registro mais antigo do provedor", async () => {
        mocks.aggregate.mockResolvedValue([])
        mocks.findOne.mockReturnValue(chain({ createdAt: new Date("2026-10-12T12:00:00.000Z") }))
        const result = await getProviderUsage("deepseek", {})
        expect(result.coverageFrom).toBe("2026-10-12T12:00:00.000Z")
    })
})

describe("provedores com painel de consumo direto", () => {
    it("aceita só Gemini, Anthropic, OpenAI e DeepSeek", () => {
        for (const provider of ["gemini", "anthropic", "openai", "deepseek"]) expect(isUsageProviderId(provider)).toBe(true)
        for (const provider of ["opencode", "jev", "desconhecido"]) expect(isUsageProviderId(provider)).toBe(false)
    })

    it("converte o calendário local incluindo todo o dia final e rejeita períodos inválidos", () => {
        const range = usageRangeQuery("2026-10-10", "2026-10-11")!
        expect(new Date(range.from!).getHours()).toBe(0)
        expect(new Date(range.to!).getHours()).toBe(23)
        expect(usageRangeQuery("2026-10-12", "2026-10-10")).toBeNull()
        expect(usageRangeQuery("not-a-date", "")).toBeNull()
        expect(usageRangeQuery("", "")).toEqual({ from: undefined, to: undefined })
    })
})

describe("formatTokensCompact", () => {
    it("abrevia com até 3 casas decimais, sem zeros à direita e com vírgula pt-BR", () => {
        expect(formatTokensCompact(0)).toBe("0")
        expect(formatTokensCompact(999)).toBe("999")
        expect(formatTokensCompact(1000)).toBe("1k")
        expect(formatTokensCompact(1234)).toBe("1,234k")
        expect(formatTokensCompact(45000)).toBe("45k")
        expect(formatTokensCompact(2500000)).toBe("2,5M")
        expect(formatTokensCompact(1500000)).toBe("1,5M")
        expect(formatTokensCompact(1000000000)).toBe("1B")
    })

    it("promove de unidade quando o arredondamento chega a mil", () => {
        expect(formatTokensCompact(999999)).toBe("999,999k")
        expect(formatTokensCompact(999999.6)).toBe("1M")
    })
})
