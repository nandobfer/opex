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
    it("mantém só ids conhecidos, sem repetição e no limite", () => {
        expect(filterKnownTags(["api", "api", "ghost", "frontend"], DEFAULT_TASK_TAXONOMY, 5)).toEqual(["api", "frontend"])
        expect(filterKnownTags(["api", "frontend"], DEFAULT_TASK_TAXONOMY, 1)).toEqual(["api"])
    })

    it("rótulo cai no id quando a tag saiu da taxonomia", () => {
        expect(tagLabel("api", DEFAULT_TASK_TAXONOMY)).toBe("API")
        expect(tagLabel("desconhecida", DEFAULT_TASK_TAXONOMY)).toBe("desconhecida")
    })
})
