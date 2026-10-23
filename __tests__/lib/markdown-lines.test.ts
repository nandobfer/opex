import { describe, expect, it } from "vitest"
import { lineHash, normalizeLine, quoteOf, sourceLines } from "@/lib/markdown/lines"

describe("linhas lógicas do Markdown", () => {
    it("normaliza marcadores de bloco, pipes, espaços e maiúsculas", () => {
        expect(normalizeLine("> - [x] Item  **Forte**")).toBe("item **forte**")
        expect(normalizeLine("## Título")).toBe("título")
        expect(normalizeLine("| A | B |")).toBe("a b")
    })

    it("o hash da citação bate com o da linha crua", () => {
        expect(lineHash(quoteOf("- item de lista", 1))).toBe(lineHash("- item de lista"))
        expect(lineHash("| 1 | 2 |")).toBe(lineHash(quoteOf("| 1 | 2 |", 1)))
        expect(lineHash("a")).not.toBe(lineHash("b"))
        expect(lineHash("x")).toMatch(/^[0-9a-f]{8}$/)
    })

    it("lista só as linhas que recebem ação", () => {
        const md = ["Texto", "", "```ts", "code()", "```", "| A |", "| --- |", "| 1 |", "---", "<!-- oculto -->", "fim"].join("\n")
        expect(sourceLines(md).map((line) => line.line)).toEqual([1, 4, 6, 8, 11])
    })

    it("linhas unidas por quebra simples formam uma só linha renderizada; quebra forçada, lista e título separam", () => {
        const md = ["Um parágrafo", "continua aqui  ", "depois da quebra", "- item", "continuação do item", "- outro", "# Título", "texto", "> cita", "> junto"].join("\n")
        expect(sourceLines(md).map(({ line, endLine }) => [line, endLine])).toEqual([[1, 2], [3, 3], [4, 5], [6, 6], [7, 7], [8, 8], [9, 10]])
        const [first] = sourceLines(md)
        expect(first!.hash).toBe(lineHash(quoteOf(md, 1, 2)))
        expect(sourceLines("```\na\nb\n```").map(({ line, endLine }) => [line, endLine])).toEqual([[2, 2], [3, 3]])
    })

    it("cita intervalo juntando linhas e preserva linha de código", () => {
        expect(quoteOf("> uma\n> duas", 1, 2)).toBe("uma duas")
        expect(quoteOf("  - x  ", 1, 1, { code: true })).toBe("  - x")
    })
})
