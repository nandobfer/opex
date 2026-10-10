/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { MarkdownField } from "@/components/ui/markdown-field"

describe("MarkdownField", () => {
    it("insere a formatação no texto", () => {
        const onChange = vi.fn()
        render(<MarkdownField value="" onChange={onChange} />)
        fireEvent.click(screen.getByLabelText("Negrito"))
        expect(onChange).toHaveBeenCalledWith("**texto**")
    })

    it("insere a sintaxe de imagem", () => {
        const onChange = vi.fn()
        render(<MarkdownField value="" onChange={onChange} />)
        fireEvent.click(screen.getByLabelText("Imagem"))
        expect(onChange).toHaveBeenCalledWith("![descrição](https://)")
    })

    it("edita o valor pelo campo de texto", () => {
        const onChange = vi.fn()
        render(<MarkdownField value="" onChange={onChange} />)
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "novo texto" } })
        expect(onChange).toHaveBeenCalledWith("novo texto")
    })

    it("mostra a pré-visualização na aba Visualizar", () => {
        render(<MarkdownField value="# Título" onChange={() => {}} />)
        fireEvent.click(screen.getByRole("tab", { name: /Visualizar/ }))
        expect(screen.getByText("Título")).toBeTruthy()
    })
})
