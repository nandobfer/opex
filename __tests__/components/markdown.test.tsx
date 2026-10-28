/** @vitest-environment happy-dom */

import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { Markdown } from "@/components/ui/markdown"

describe("Markdown — cores da formatação", () => {
    it("colore títulos, negrito, código inline e citação pelos tokens md-*", () => {
        const { container } = render(<Markdown>{"# Título\n\nTexto **forte** com `codigo`.\n\n> citação"}</Markdown>)
        expect(screen.getByText("Título").classList.contains("text-md-heading")).toBe(true)
        expect(screen.getByText("forte").classList.contains("text-md-strong")).toBe(true)
        const code = screen.getByText("codigo")
        expect(code.classList.contains("text-md-code")).toBe(true)
        expect(code.classList.contains("bg-muted")).toBe(true)
        expect(container.querySelector("blockquote")?.classList.contains("border-md-quote/60")).toBe(true)
    })

    it("mantém o bloco de código em texto neutro e marca os itens de lista em âmbar", () => {
        const { container } = render(<Markdown>{"- item\n\n```ts\nconst a = 1\n```"}</Markdown>)
        expect(container.querySelector("ul")?.classList.contains("marker:text-md-strong/70")).toBe(true)
        expect(container.querySelector("pre")?.classList.contains("[&>code]:text-foreground/90")).toBe(true)
    })
})
