import { describe, expect, it } from "vitest"
import { composePersonality, diffPersonality, emptyPersonality, normalizePersonality, type PersonalitySnapshot } from "@/features/secretary-agent/personality"

function base(tone: string) {
    const personality = emptyPersonality()
    return { blocks: personality.blocks.map((block) => (block.key === "tom" ? { ...block, content: tone } : block)) }
}

describe("composePersonality", () => {
    it("monta a base e acrescenta a variante da conversa no bloco correspondente", () => {
        const text = composePersonality(base("Direto e brincalhão"), { title: "Mãe", blocks: [{ key: "tom", title: "Tom", content: "Carinhoso" }, { key: "apelidos", title: "Apelidos", content: "Chama de mãezinha" }] })
        expect(text).toContain("### Tom e formalidade\nDireto e brincalhão\nNesta conversa (Mãe): Carinhoso")
        expect(text).toContain("### Apelidos (nesta conversa: Mãe)\nChama de mãezinha")
        expect(text).not.toContain("### Identidade")
    })

    it("sem variante usa só a base", () => {
        expect(composePersonality(base("Formal"), null)).toBe("### Tom e formalidade\nFormal")
    })

    it("normaliza garantindo os blocos fixos e mantendo extras", () => {
        const normalized = normalizePersonality({ blocks: [{ key: "extra", title: "Trabalho", content: "dev" }] })
        expect(normalized.blocks).toHaveLength(9)
        expect(normalized.blocks.at(-1)?.key).toBe("extra")
    })
})

describe("diffPersonality", () => {
    it("lista o que mudou por bloco, na base e nas variantes", () => {
        const before: PersonalitySnapshot = { base: base("Formal"), variants: [] }
        const after: PersonalitySnapshot = { base: base("Informal"), variants: [{ jid: "x@s.whatsapp.net", title: "Mãe", origin: "analysis", blocks: [{ key: "tom", title: "Tom", content: "Carinhoso" }] }] }
        const changes = diffPersonality(before, after)
        expect(changes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ scope: "base", key: "tom", kind: "changed", before: "Formal", after: "Informal" }),
                expect.objectContaining({ scope: "x@s.whatsapp.net", key: "tom", kind: "added" }),
            ]),
        )
        expect(diffPersonality(after, after)).toEqual([])
    })
})
