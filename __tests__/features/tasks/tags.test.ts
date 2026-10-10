import { describe, expect, it } from "vitest"
import { DEFAULT_TASK_TAXONOMY, filterKnownTags, normalizeTaxonomy, slugifyTag, tagLabel, uniqueTagId } from "@/features/tasks/tags"

describe("slugifyTag", () => {
    it("minúsculas, sem acentos e com hífen", () => {
        expect(slugifyTag("Banco de dados")).toBe("banco-de-dados")
        expect(slugifyTag("Autenticação")).toBe("autenticacao")
        expect(slugifyTag("  API/HTTP ")).toBe("api-http")
    })
})

describe("normalizeTaxonomy", () => {
    it("deriva o id do rótulo, remove vazios e duplicatas, mantendo a ordem", () => {
        expect(
            normalizeTaxonomy([
                { id: "", label: "Frontend" },
                { id: "FRONTEND", label: "Front" },
                { id: "x", label: "" },
                { id: "api", label: "API" },
            ]),
        ).toEqual([
            { id: "frontend", label: "Frontend" },
            { id: "api", label: "API" },
        ])
    })
})

describe("uniqueTagId", () => {
    it("acrescenta sufixo numérico quando o id já existe", () => {
        expect(uniqueTagId("API", ["api"])).toBe("api-2")
        expect(uniqueTagId("API", ["api", "api-2"])).toBe("api-3")
    })
})

describe("filterKnownTags e tagLabel", () => {
    const taxonomy = [
        { id: "integracoes", label: "Integrações" },
        { id: "checkout", label: "Checkout e carrinho" },
    ]

    it("mantém só ids conhecidos, sem repetição e no limite", () => {
        expect(filterKnownTags(["integracoes", "integracoes", "ghost", "checkout"], taxonomy, 5)).toEqual(["integracoes", "checkout"])
        expect(filterKnownTags(["integracoes", "checkout"], taxonomy, 1)).toEqual(["integracoes"])
    })

    it("rótulo cai no id quando a tag saiu da taxonomia", () => {
        expect(tagLabel("integracoes", taxonomy)).toBe("Integrações")
        expect(tagLabel("desconhecida", taxonomy)).toBe("desconhecida")
    })
})

describe("DEFAULT_TASK_TAXONOMY", () => {
    it("não repete ids e não tem rótulo vazio", () => {
        const ids = DEFAULT_TASK_TAXONOMY.map((tag) => tag.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(DEFAULT_TASK_TAXONOMY.every((tag) => tag.label.trim().length > 0)).toBe(true)
    })
})
