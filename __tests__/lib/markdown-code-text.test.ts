import { describe, expect, it } from "vitest"
import { codeBlockText } from "@/lib/markdown/code-text"

const text = (value: string) => ({ type: "text", value })
const el = (tagName: string, children: unknown[]) => ({ type: "element", tagName, properties: {}, children }) as never

describe("codeBlockText", () => {
    it("bloco simples: devolve o código sem a quebra final", () => {
        expect(codeBlockText(el("pre", [el("code", [text("const a = 1\n")])]))).toBe("const a = 1")
    })

    it("com os marcadores de linha do plugin: devolve o fonte, inclusive linhas vazias", () => {
        const code = el("code", [el("span", [text("x = 1")]), text("\n"), text("\n"), el("span", [text("y = 2")]), text("\n")])
        expect(codeBlockText(el("pre", [code]))).toBe("x = 1\n\ny = 2")
    })

    it("bloco vazio ou sem nó: string vazia", () => {
        expect(codeBlockText(el("pre", [el("code", [])]))).toBe("")
        expect(codeBlockText(undefined)).toBe("")
    })
})
