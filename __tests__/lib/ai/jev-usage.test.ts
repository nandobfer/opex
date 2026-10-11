import { describe, expect, it } from "vitest"
import { allocateJevHistoricalUsage, normalizeJevUsage } from "@/lib/ai/jev-usage"

describe("usage e custo JEV", () => {
    it("soma entrada e saída, mas cobra somente entrada sem arredondar por chamada", () => {
        const usage = normalizeJevUsage({ input_tokens: 296, output_tokens: 20 })
        expect(usage).toMatchObject({ inputTokens: 296, outputTokens: 20, totalTokens: 316, inputPricePerMillionUsd: 0.042, usageSource: "api" })
        expect(usage.costUsd).toBeCloseTo(0.000012432, 12)
    })

    it("preserva zero conhecido e não confunde ausência com zero", () => {
        expect(normalizeJevUsage({ input_tokens: 0, output_tokens: 0 })).toMatchObject({ totalTokens: 0, costUsd: 0 })
        expect(normalizeJevUsage()).toMatchObject({ inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null })
        expect(normalizeJevUsage({ input_tokens: 100 })).toMatchObject({ inputTokens: 100, outputTokens: null, totalTokens: null })
        expect(normalizeJevUsage({ input_tokens: 100 }).costUsd).toBeCloseTo(0.0000042, 12)
        expect(normalizeJevUsage({ output_tokens: 10 })).toMatchObject({ inputTokens: null, outputTokens: 10, totalTokens: null, costUsd: null })
    })

    it("descarta métricas inválidas, negativas, fracionárias ou não finitas", () => {
        for (const value of [-1, 1.5, Infinity, NaN, "20", Number.MAX_SAFE_INTEGER + 1]) {
            expect(normalizeJevUsage({ input_tokens: value, output_tokens: value })).toMatchObject({ inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null })
        }
    })
})

describe("rateio histórico", () => {
    it("fecha exatamente 235088 tokens e 6700000 nano-USD nos 149 registros", () => {
        const ids = Array.from({ length: 149 }, (_, index) => String(index))
        const allocated = allocateJevHistoricalUsage(ids, 235088, 6700000)
        expect(allocated.reduce((sum, row) => sum + row.totalTokens, 0)).toBe(235088)
        expect(allocated.reduce((sum, row) => sum + Math.round(row.costUsd * 1e9), 0)).toBe(6700000)
        expect(allocated.every((row) => row.inputTokens === null && row.outputTokens === null && row.inputPricePerMillionUsd === null && row.usageSource === "historical-allocation")).toBe(true)
        expect(allocateJevHistoricalUsage(ids, 235088, 6700000)).toEqual(allocated)
    })

    it("rejeita seleção vazia, duplicada e totais inválidos", () => {
        expect(() => allocateJevHistoricalUsage([], 1, 1)).toThrow()
        expect(() => allocateJevHistoricalUsage(["a", "a"], 1, 1)).toThrow()
        expect(() => allocateJevHistoricalUsage(["a"], -1, 1)).toThrow()
        expect(() => allocateJevHistoricalUsage(["a"], 1, 1.5)).toThrow()
    })
})
