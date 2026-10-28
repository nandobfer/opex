/** @vitest-environment happy-dom */

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { MessageSquare } from "lucide-react"
import { Markdown } from "@/components/ui/markdown"
import { MarkdownLineActionProvider, type MarkdownLineAction } from "@/components/ui/markdown-line-action"

const lines = (container: HTMLElement) => [...container.querySelectorAll("[data-md-line-action]")].map((node) => node.parentElement!)

function action(overrides: Partial<MarkdownLineAction> = {}): MarkdownLineAction {
    return { icon: MessageSquare, label: "Comentar a linha", onSelect: vi.fn(), ...overrides }
}

describe("Markdown — ações por linha", () => {
    it("sem ação, renderiza como antes (nenhum botão)", () => {
        const { container } = render(<Markdown>{"linha 1\nlinha 2"}</Markdown>)
        expect(lines(container)).toHaveLength(0)
    })

    it("quebra simples fica na mesma linha renderizada (um botão só, no fim); quebra forçada separa", () => {
        const onSelect = vi.fn()
        const { container } = render(<Markdown lineAction={action({ onSelect })}>{"primeira **forte**\nsegunda linha  \nterceira"}</Markdown>)
        const rows = lines(container)
        expect(rows).toHaveLength(2)
        expect(rows[0]!.textContent).toContain("primeira forte\nsegunda linha")
        const buttons = screen.getAllByRole("button", { name: "Comentar a linha" })
        fireEvent.click(buttons[0]!)
        fireEvent.click(buttons[1]!)
        expect(onSelect.mock.calls.map(([context]) => context)).toEqual([
            { line: 1, endLine: 2, code: false, text: "primeira **forte** segunda linha" },
            { line: 3, endLine: 3, code: false, text: "terceira" },
        ])
    })

    it("cobre títulos, listas aninhadas, tabelas e cada linha de código (sem as cercas)", () => {
        const md = ["# Título", "", "- item a", "  - sub b", "", "| A | B |", "| - | - |", "| 1 | 2 |", "", "```", "x = 1", "", "y = 2", "```"].join("\n")
        const onSelect = vi.fn()
        const { container } = render(<Markdown lineAction={action({ onSelect })}>{md}</Markdown>)
        const buttons = screen.getAllByRole("button", { name: "Comentar a linha" })
        buttons.forEach((button) => fireEvent.click(button))
        const called = onSelect.mock.calls.map(([context]) => [context.line, context.text, context.code])
        expect(called).toEqual([
            [1, "Título", false],
            [3, "item a", false],
            [4, "sub b", false],
            [6, "A | B", false],
            [8, "1 | 2", false],
            [11, "x = 1", true],
            [13, "y = 2", true],
        ])
        expect(container.querySelectorAll("pre [data-md-line-action]")).toHaveLength(2)
    })

    it("não muda a renderização: mesmo texto, quebras e blocos de antes (marcadores inline)", () => {
        const md = ["primeira\nsegunda linha do parágrafo", "", "- [ ] tarefa", "", "```", "a", "", "b", "```"].join("\n")
        const plain = render(<Markdown>{md}</Markdown>).container
        const withAction = render(<Markdown lineAction={action()}>{md}</Markdown>).container
        const strip = (root: HTMLElement) => {
            const clone = root.cloneNode(true) as HTMLElement
            clone.querySelectorAll("[data-md-line-action]").forEach((node) => node.remove())
            return clone
        }
        const stripped = strip(withAction)
        expect(stripped.textContent).toBe(plain.textContent)
        expect(stripped.querySelector("p")!.textContent).toBe("primeira\nsegunda linha do parágrafo")
        expect(stripped.querySelector("pre")!.textContent).toBe(plain.querySelector("pre")!.textContent)
        expect(stripped.querySelectorAll("p, li, pre, br").length).toBe(plain.querySelectorAll("p, li, pre, br").length)
        expect(withAction.querySelector(".block[data-md-anchor], span.block")).toBeNull()
    })

    it("mostra o badge e o destaque nas linhas com contagem", () => {
        const { container } = render(<Markdown lineAction={action({ count: (line) => (line === 3 ? 3 : 0), anchorId: "description" })}>{"a\n\nb"}</Markdown>)
        expect(screen.getByRole("button", { name: "Comentar a linha (3)" })).toBeTruthy()
        const anchored = container.querySelector('[data-md-anchor="description:3"]')
        expect(anchored?.classList.contains("bg-primary/5")).toBe(true)
    })

    it("herda a ação do provider e a prop null desliga", () => {
        const inherited = action({ label: "Citar" })
        const { container } = render(
            <MarkdownLineActionProvider action={inherited}>
                <Markdown>{"herdada"}</Markdown>
                <div data-testid="off">
                    <Markdown lineAction={null}>{"desligada"}</Markdown>
                </div>
            </MarkdownLineActionProvider>,
        )
        expect(screen.getAllByRole("button", { name: "Citar" })).toHaveLength(1)
        expect(lines(container)[0]!.textContent).toContain("herdada")
    })
})
