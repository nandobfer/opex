/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { codeContentRange, rehypeSourceOffsets } from "@/lib/markdown/rehype-source-offsets"

afterEach(cleanup)

function mount(source: string): HTMLElement {
    const { container } = render(
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSourceOffsets]}>
            {source}
        </ReactMarkdown>,
    )
    return container
}

/** Trechos do fonte: o elemento inteiro e o conteúdo (sem os marcadores). */
function slices(source: string, element: Element) {
    const num = (name: string) => Number(element.getAttribute(name))
    return {
        own: source.slice(num("data-md-start"), num("data-md-end")),
        content: source.slice(num("data-md-content-start"), num("data-md-content-end")),
        tag: element.getAttribute("data-md-tag"),
    }
}

describe("rehypeSourceOffsets", () => {
    it("título, negrito, link, item de lista e citação: elemento e conteúdo sem marcadores", () => {
        const source = "## Título\n\nUm **forte** e [link](https://x.dev)\n\n- item\n\n> citação"
        const root = mount(source)
        expect(slices(source, root.querySelector("h2")!)).toEqual({ own: "## Título", content: "Título", tag: "h2" })
        expect(slices(source, root.querySelector("strong")!)).toEqual({ own: "**forte**", content: "forte", tag: "strong" })
        expect(slices(source, root.querySelector("a")!)).toEqual({ own: "[link](https://x.dev)", content: "link", tag: "a" })
        expect(slices(source, root.querySelector("li")!)).toEqual({ own: "- item", content: "item", tag: "li" })
        expect(slices(source, root.querySelector("blockquote")!).own).toBe("> citação")
    })

    it("linha e célula de tabela", () => {
        const source = "| A | B |\n|---|---|\n| 1 | 2 |"
        const root = mount(source)
        expect(slices(source, root.querySelectorAll("tr")[1]!).own).toBe("| 1 | 2 |")
        expect(slices(source, root.querySelectorAll("td")[1]!).content).toBe("2")
    })

    it("pre com cerca e linguagem: conteúdo entre as cercas; o code de dentro não é anotado", () => {
        const source = "```ts\nconst a = 1\nconst b = 2\n```"
        const root = mount(source)
        expect(slices(source, root.querySelector("pre")!)).toEqual({ own: source, content: "const a = 1\nconst b = 2", tag: "pre" })
        expect(root.querySelector("pre code")!.hasAttribute("data-md-start")).toBe(false)
    })

    it("pre indentado cobre o bloco inteiro; cerca sem fechamento vai até o fim", () => {
        expect(codeContentRange("    ind", 0, 7)).toEqual({ start: 0, end: 7 })
        const open = "```\nsem fim"
        expect(codeContentRange(open, 0, open.length)).toEqual({ start: 4, end: open.length })
    })
})
