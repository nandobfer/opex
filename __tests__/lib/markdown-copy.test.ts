import { describe, expect, it } from "vitest"
import { alignRenderedOffset } from "@/lib/markdown/copy"

describe("alignRenderedOffset", () => {
    it("pula marcação e escape do fonte", () => {
        const source = "Um **ne** \\* fim"
        expect(alignRenderedOffset(source, "Um ne", 0)).toBe(7)
        expect(alignRenderedOffset(source, "Um ne * f", 0)).toBe(source.indexOf("f") + 1)
    })

    it("quebra simples e `> ` da citação: espaço casa com espaço e o prefixo é pulado", () => {
        const source = "> linha um\n> linha dois"
        expect(alignRenderedOffset(source, "linha um\nlinha", 2)).toBe(source.lastIndexOf("linha") + 5)
    })

    it("indentação de lista e espaço renderizado sem par no fonte", () => {
        const source = "- a\n  - b"
        expect(alignRenderedOffset(source, "a\n\nb", 2)).toBe(source.length)
    })

    it("devolve null quando um caractere renderizado não aparece até o limite", () => {
        expect(alignRenderedOffset("abc", "abz", 0)).toBeNull()
        expect(alignRenderedOffset("abc def", "abc d", 0, 4)).toBeNull()
    })
})
