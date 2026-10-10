import { describe, expect, it } from "vitest"
import {
    buildBudgetEstimateInstructions,
    buildBudgetEstimatePrompt,
    buildBudgetPreviewInstructions,
    buildBudgetPreviewPrompt,
    buildEstimateContext,
    extractJsonObject,
    parseDraftPreview,
    parseEstimateHours,
    type EstimateStats,
} from "@/features/orcamentos/preview-prompt"
import type { DraftPreview } from "@/features/orcamentos/schemas"

const stats: EstimateStats = {
    globalAverageHours: 3.5,
    totalTasks: 4,
    byType: [{ taskType: "feature", label: "Nova Funcionalidade", averageHours: 4, count: 3 }],
}

const preview: DraftPreview = { title: "Corrigir X", taskType: "bugfix", priority: "high", technicalSpec: "## Passos", summary: "Corrige X" }

describe("prompt da prévia (fase 1)", () => {
    it("instrui a IA a responder um JSON com as chaves da prévia, sem as horas", () => {
        const instructions = buildBudgetPreviewInstructions("Você é um analista.")
        for (const key of ['"title"', '"taskType"', '"priority"', '"technicalSpec"', '"summary"']) {
            expect(instructions).toContain(key)
        }
        expect(instructions).not.toContain('"estimatedHours"')
    })

    it("inclui a descrição do cliente no prompt", () => {
        const prompt = buildBudgetPreviewPrompt({ projectName: "acme/app", description: "Ajustar rodapé", correction: null })
        expect(prompt).toContain("Ajustar rodapé")
    })

    it("inclui a correção quando houver", () => {
        const prompt = buildBudgetPreviewPrompt({ projectName: "acme/app", description: "x", correction: "Mude o título" })
        expect(prompt).toContain("Correção solicitada")
        expect(prompt).toContain("Mude o título")
    })
})

describe("prompt da estimativa (fase 2)", () => {
    it("instrui a IA a responder somente estimatedHours", () => {
        const instructions = buildBudgetEstimateInstructions("Você é um analista.")
        expect(instructions).toContain('"estimatedHours"')
        expect(instructions).not.toContain('"technicalSpec"')
    })

    it("inclui a prévia e o histórico de horas no prompt", () => {
        const prompt = buildBudgetEstimatePrompt(preview, { projectName: "acme/app", description: "Ajustar rodapé", correction: null }, stats)
        expect(prompt).toContain("Corrigir X")
        expect(prompt).toContain("Ajustar rodapé")
        expect(prompt).toContain("Nova Funcionalidade: 4.0 h por tarefa")
    })

    it("sem histórico, orienta a estimar por conhecimento próprio", () => {
        const context = buildEstimateContext({ globalAverageHours: 0, totalTasks: 0, byType: [] })
        expect(context).toMatch(/não há histórico/i)
    })
})

describe("parse da saída da IA", () => {
    it("extrai e valida a prévia mesmo com cercas de código", () => {
        const text = '```json\n{"title":"Corrigir X","taskType":"bugfix","priority":"high","technicalSpec":"## Passos","summary":"Corrige X"}\n```'
        expect(extractJsonObject(text)).toContain('"title":"Corrigir X"')
        expect(parseDraftPreview(text)).toEqual({ title: "Corrigir X", taskType: "bugfix", priority: "high", technicalSpec: "## Passos", summary: "Corrige X" })
    })

    it("aceita taskType nulo", () => {
        const parsed = parseDraftPreview('{"title":"T","taskType":null,"priority":"low","technicalSpec":"","summary":"S"}')
        expect(parsed?.taskType).toBeNull()
    })

    it("devolve null quando a prévia não é JSON válido ou não casa o schema", () => {
        expect(parseDraftPreview("sem json aqui")).toBeNull()
        expect(parseDraftPreview('{"title":"T"}')).toBeNull()
        expect(parseDraftPreview('{"title":"T","taskType":"invalido","priority":"low","technicalSpec":"","summary":"S"}')).toBeNull()
    })

    it("valida a estimativa de horas (aceita cercas de código e recusa valores inválidos)", () => {
        expect(parseEstimateHours('```json\n{"estimatedHours":2.5}\n```')).toBe(2.5)
        expect(parseEstimateHours('{"estimatedHours":0}')).toBe(0)
        expect(parseEstimateHours("sem json")).toBeNull()
        expect(parseEstimateHours('{"estimatedHours":"duas"}')).toBeNull()
        expect(parseEstimateHours('{"estimatedHours":-1}')).toBeNull()
    })
})
