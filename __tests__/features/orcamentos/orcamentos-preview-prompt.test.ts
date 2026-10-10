import { describe, expect, it } from "vitest"
import { buildBudgetEstimateInstructions, buildBudgetEstimatePrompt, buildBudgetPreviewInstructions, buildBudgetPreviewPrompt, buildJevEstimateQuestions, estimateAnchor, extractJsonObject, JEV_ESTIMATE_QUESTION_ID, mapJevEstimateScore, parseDraftPreview, parseEstimateHours } from "@/features/orcamentos/preview-prompt"
import type { DraftPreview } from "@/features/orcamentos/schemas"

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

describe("prompt da estimativa (fase 2 — uma chamada com o histórico)", () => {
    it("instrui a responder somente estimatedHours, sem ferramentas", () => {
        const instructions = buildBudgetEstimateInstructions("Você é um estimador.")
        expect(instructions).toContain('"estimatedHours"')
        expect(instructions).not.toContain('"technicalSpec"')
        expect(instructions.toLowerCase()).not.toContain("ferramentas")
    })

    it("inclui a prévia, o pedido original e as tarefas semelhantes no prompt", () => {
        const prompt = buildBudgetEstimatePrompt(preview, { projectName: "acme/app", description: "Ajustar rodapé", correction: null }, [
            { code: "OPX-1", title: "Rodapé anterior", taskType: "bugfix", tags: ["frontend"], hours: 4 },
        ])
        expect(prompt).toContain("Corrigir X")
        expect(prompt).toContain("Ajustar rodapé")
        expect(prompt).toContain("OPX-1")
        expect(prompt).toContain("4 h")
    })

    it("sem semelhantes, avisa que o histórico está vazio", () => {
        const prompt = buildBudgetEstimatePrompt(preview, { projectName: "acme/app", description: "x", correction: null }, [])
        expect(prompt).toContain("Nenhuma tarefa semelhante")
    })

    it("inclui a mediana do histórico como âncora", () => {
        const prompt = buildBudgetEstimatePrompt(preview, { projectName: "acme/app", description: "x", correction: null }, [
            { code: "A", title: "a", taskType: null, tags: [], hours: 0.5 },
            { code: "B", title: "b", taskType: null, tags: [], hours: 0.2 },
            { code: "C", title: "c", taskType: null, tags: [], hours: 0.4 },
        ])
        expect(prompt).toContain("Referência do histórico")
        expect(prompt).toContain("mediana 0.4 h")
    })
})

describe("âncora do histórico (estimateAnchor)", () => {
    it("calcula a mediana e a faixa das horas reais", () => {
        expect(
            estimateAnchor([
                { code: "A", title: "a", taskType: null, tags: [], hours: 0.5 },
                { code: "B", title: "b", taskType: null, tags: [], hours: 0.2 },
                { code: "C", title: "c", taskType: null, tags: [], hours: 0.4 },
            ]),
        ).toEqual({ count: 3, median: 0.4, min: 0.2, max: 0.5 })
    })

    it("sem horas, devolve null", () => {
        expect(estimateAnchor([])).toBeNull()
    })
})

describe("estimativa via JEV (score fracionário → horas)", () => {
    it("mapeia o score (posição contínua) para horas por interpolação", () => {
        expect(mapJevEstimateScore(0)).toBe(0.05)
        expect(mapJevEstimateScore(2)).toBe(0.25)
        expect(mapJevEstimateScore(9)).toBe(12)
        expect(mapJevEstimateScore(99)).toBe(12)
        const mid = mapJevEstimateScore(2.5)
        expect(mid).toBeGreaterThan(0.25)
        expect(mid).toBeLessThan(0.42)
    })

    it("monta uma pergunta score com 10 níveis de tempo de execução", () => {
        const question = buildJevEstimateQuestions()[JEV_ESTIMATE_QUESTION_ID]
        expect(question).toMatchObject({ type: "score" })
        expect(question.type === "score" && question.criteria.length).toBe(10)
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
