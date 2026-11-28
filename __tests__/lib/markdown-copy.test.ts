/** @vitest-environment happy-dom */

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

    it("referências de caractere consomem a entidade inteira", () => {
        expect(alignRenderedOffset("a &copy; b", "a ©", 0)).toBe(8)
        expect(alignRenderedOffset("&#169;x", "©x", 0)).toBe(7)
        expect(alignRenderedOffset("&#xA9;", "©", 0)).toBe(6)
        expect(alignRenderedOffset("&amp; x", "&", 0)).toBe(5)
        expect(alignRenderedOffset("&#65;", "©", 0)).toBeNull()
        // Nomeada de dois caracteres (U+2242 U+0338): a sequência inteira casa com a entidade.
        expect(alignRenderedOffset("a &NotEqualTilde; b", "a \u2242\u0338 b", 0)).toBe(19)
        // Nome inexistente fica literal na tela e casa caractere a caractere.
        expect(alignRenderedOffset("&foo; x", "&foo; x", 0)).toBe(7)
    })

    it("devolve null quando um caractere renderizado não aparece até o limite", () => {
        expect(alignRenderedOffset("abc", "abz", 0)).toBeNull()
        expect(alignRenderedOffset("abc def", "abc d", 0, 4)).toBeNull()
    })
})
