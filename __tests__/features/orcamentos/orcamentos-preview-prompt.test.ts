import { describe, expect, it } from "vitest"
import { buildBudgetPreviewInstructions, buildBudgetPreviewPrompt, buildEstimateContext, extractJsonObject, parseDraftPreview } from "@/features/orcamentos/preview-prompt"
import type { EstimateStats } from "@/features/orcamentos/preview-prompt"

const stats: EstimateStats = {
    globalAverageHours: 3.5,
    totalTasks: 4,
    byType: [{ taskType: "feature", label: "Nova Funcionalidade", averageHours: 4, count: 3 }],
}

describe("prompt da prévia/orçamento", () => {
    it("instrui a IA a responder um JSON com as chaves da prévia", () => {
        const instructions = buildBudgetPreviewInstructions("Você é um analista.")
        for (const key of ['"title"', '"taskType"', '"priority"', '"technicalSpec"', '"summary"', '"estimatedHours"']) {
            expect(instructions).toContain(key)
        }
    })

    it("inclui a descrição do cliente e o histórico de horas no prompt", () => {
        const prompt = buildBudgetPreviewPrompt({ projectName: "acme/app", description: "Ajustar rodapé", correction: null }, stats)
        expect(prompt).toContain("Ajustar rodapé")
        expect(prompt).toContain("Nova Funcionalidade: 4.0 h por tarefa")
    })

    it("inclui a correção quando houver", () => {
        const prompt = buildBudgetPreviewPrompt({ projectName: "acme/app", description: "x", correction: "Mude o título" }, stats)
        expect(prompt).toContain("Correção solicitada")
        expect(prompt).toContain("Mude o título")
    })

    it("sem histórico, orienta a estimar por conhecimento próprio", () => {
        const context = buildEstimateContext({ globalAverageHours: 0, totalTasks: 0, byType: [] })
        expect(context).toMatch(/não há histórico/i)
    })
})

describe("parse da saída da IA", () => {
    it("extrai e valida o JSON mesmo com cercas de código", () => {
        const text = '```json\n{"title":"Corrigir X","taskType":"bugfix","priority":"high","technicalSpec":"## Passos","summary":"Corrige X","estimatedHours":2.5}\n```'
        expect(extractJsonObject(text)).toContain('"title":"Corrigir X"')
        expect(parseDraftPreview(text)).toEqual({ title: "Corrigir X", taskType: "bugfix", priority: "high", technicalSpec: "## Passos", summary: "Corrige X", estimatedHours: 2.5 })
    })

    it("aceita taskType nulo", () => {
        const parsed = parseDraftPreview('{"title":"T","taskType":null,"priority":"low","technicalSpec":"","summary":"S","estimatedHours":1}')
        expect(parsed?.taskType).toBeNull()
    })

    it("devolve null quando não é JSON válido ou não casa o schema", () => {
        expect(parseDraftPreview("sem json aqui")).toBeNull()
        expect(parseDraftPreview('{"title":"T"}')).toBeNull()
        expect(parseDraftPreview('{"title":"T","taskType":"invalido","priority":"low","technicalSpec":"","summary":"S","estimatedHours":1}')).toBeNull()
    })
})
