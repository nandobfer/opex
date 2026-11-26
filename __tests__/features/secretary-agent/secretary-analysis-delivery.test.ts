import { describe, expect, it } from "vitest"
import { analysisResultSchema, normalizeAnalysisDelivery, slugKey } from "@/features/secretary-agent/analysis-delivery"

const parse = (raw: unknown) => analysisResultSchema.safeParse(normalizeAnalysisDelivery(raw))

describe("entrega da análise", () => {
    it("chaves com sublinhado, espaço ou acento viram slug", () => {
        expect(slugKey("tom_de_voz")).toBe("tom-de-voz")
        expect(slugKey("Tom de Voz")).toBe("tom-de-voz")
        expect(slugKey("Pontuação & Emojis")).toBe("pontuacao-emojis")
    })

    it("normaliza chave, título longo e variante ausente", () => {
        const result = parse({ blocks: [{ key: "tom_de_voz", title: "T".repeat(120), content: "Informal" }] })
        expect(result.success).toBe(true)
        expect(result.data?.blocks[0]).toEqual({ key: "tom-de-voz", title: "T".repeat(80), content: "Informal" })
        expect(result.data?.variant).toBeNull()
    })

    it("aceita blocos em string JSON e gera a chave do título quando falta", () => {
        const result = parse({ blocks: JSON.stringify([{ title: "Emojis e risadas", content: "kkkk" }]), variant: { title: "Mãe", blocks: "[]" } })
        expect(result.data).toEqual({ blocks: [{ key: "emojis-e-risadas", title: "Emojis e risadas", content: "kkkk" }], variant: { title: "Mãe", blocks: [] } })
    })

    it("funde blocos com a mesma chave", () => {
        const result = parse({ blocks: [{ key: "tom", title: "Tom", content: "Informal" }, { key: "Tom", title: "Tom 2", content: "Curto" }] })
        expect(result.data?.blocks).toEqual([{ key: "tom", title: "Tom", content: "Informal\n\nCurto" }])
    })

    it("não inventa conteúdo: sem blocos continua inválida", () => {
        expect(parse({ variant: null }).success).toBe(false)
        expect(parse({ blocks: [{ key: "tom", title: "Tom" }] }).success).toBe(false)
    })
})
