import { describe, expect, it } from "vitest"
import { buildServiceAiInstructions, buildServiceAiPrompt, parseServiceAi } from "@/features/services/ai-prompt"

/** Prompt/parse da geração por IA de um serviço: título e resumo em JSON tolerante a cercas. */

describe("buildServiceAiInstructions", () => {
    it("inclui as instruções e o contrato JSON com title e summary", () => {
        const instructions = buildServiceAiInstructions("Descreva o serviço com clareza.")
        expect(instructions).toContain("Descreva o serviço com clareza.")
        expect(instructions).toContain('"title"')
        expect(instructions).toContain('"summary"')
    })
})

describe("buildServiceAiPrompt", () => {
    it("inclui código, data, repositório e a descrição", () => {
        const prompt = buildServiceAiPrompt({ code: "SRV-1", projectName: "Portal", serviceDate: "2026-10-08", description: "Consultoria de arquitetura" })
        expect(prompt).toContain("SRV-1")
        expect(prompt).toContain("Portal")
        expect(prompt).toContain("Consultoria de arquitetura")
    })

    it("funciona sem repositório", () => {
        const prompt = buildServiceAiPrompt({ code: "SRV-2", projectName: null, serviceDate: "2026-10-08", description: "Ajuste" })
        expect(prompt).toContain("SRV-2")
        expect(prompt).not.toContain("Repositório")
    })
})

describe("parseServiceAi", () => {
    it("lê o JSON puro", () => {
        expect(parseServiceAi('{"title":"Consultoria","summary":"Arquitetura do portal"}')).toEqual({ title: "Consultoria", summary: "Arquitetura do portal" })
    })

    it("tolera cercas de código e texto ao redor", () => {
        expect(parseServiceAi('Claro!\n```json\n{"title":"Ajuste","summary":"Correção"}\n```')).toEqual({ title: "Ajuste", summary: "Correção" })
    })

    it("devolve null quando não há JSON válido", () => {
        expect(parseServiceAi("sem json aqui")).toBeNull()
        expect(parseServiceAi('{"outra":"chave"}')).toEqual({ title: null, summary: null })
    })
})
