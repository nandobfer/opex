import { describe, expect, it } from "vitest"
import { buildJevTagQuestions, buildTaskTagsInstructions, buildTaskTagsPrompt, needsTags, parseTaskTags, selectJevTags, taskTagsSourceHash } from "@/features/ai/task-tags"
import { DEFAULT_TASK_TAXONOMY } from "@/features/tasks/tags"

describe("instruções e prompt (provedor de texto)", () => {
    it("lista a taxonomia e pede JSON com tags, respeitando o máximo", () => {
        const instructions = buildTaskTagsInstructions({ instructions: "Classifique." }, DEFAULT_TASK_TAXONOMY, 5)
        expect(instructions).toContain('"tags"')
        expect(instructions).toContain('"api"')
        expect(instructions).toContain("no máximo 5")
    })

    it("inclui título e descrição no prompt", () => {
        const prompt = buildTaskTagsPrompt({ title: "Ajustar rodapé", description: "Corpo", taskType: "feature", projectName: "acme/app", summary: null })
        expect(prompt).toContain("Ajustar rodapé")
        expect(prompt).toContain("Corpo")
    })
})

describe("parseTaskTags", () => {
    it("aceita cercas de código e mantém só ids conhecidos, sem repetição", () => {
        expect(parseTaskTags('```json\n{"tags":["api","api","ghost","frontend"]}\n```', DEFAULT_TASK_TAXONOMY, 5)).toEqual(["api", "frontend"])
    })

    it("devolve null quando não é JSON válido ou não casa o contrato", () => {
        expect(parseTaskTags("sem json", DEFAULT_TASK_TAXONOMY, 5)).toBeNull()
        expect(parseTaskTags('{"tags":"api"}', DEFAULT_TASK_TAXONOMY, 5)).toBeNull()
    })
})

describe("needsTags", () => {
    const source = { title: "T", description: "D" }

    it("sem hash (nunca gerou) ou com fonte mudada, precisa gerar", () => {
        expect(needsTags({ ...source, tagsSourceHash: null })).toBe(true)
        expect(needsTags({ title: "T2", description: "D", tagsSourceHash: taskTagsSourceHash(source) })).toBe(true)
    })

    it("com o hash da fonte atual não precisa", () => {
        expect(needsTags({ ...source, tagsSourceHash: taskTagsSourceHash(source) })).toBe(false)
    })
})

describe("JEV (uma pergunta noul por tag)", () => {
    it("monta uma pergunta por tag da taxonomia", () => {
        const questions = buildJevTagQuestions(DEFAULT_TASK_TAXONOMY)
        expect(Object.keys(questions)).toHaveLength(DEFAULT_TASK_TAXONOMY.length)
        expect(questions["tag_api"]).toMatchObject({ type: "noul" })
    })

    it("seleciona acima do limiar, ordenado por probabilidade e no limite", () => {
        const taxonomy = [
            { id: "api", label: "API" },
            { id: "ux", label: "UX" },
            { id: "bug", label: "Bug" },
        ]
        const answers = {
            tag_api: { type: "noul", noul: 0.9 },
            tag_ux: { type: "noul", noul: 0.4 },
            tag_bug: { type: "noul", noul: 0.7 },
        }
        expect(selectJevTags(answers, taxonomy, 0.5, 5)).toEqual(["api", "bug"])
        expect(selectJevTags(answers, taxonomy, 0.5, 1)).toEqual(["api"])
    })
})
