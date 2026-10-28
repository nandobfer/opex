/** @vitest-environment happy-dom */

import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

const board = vi.hoisted(() => ({
    isLoading: true,
    columns: [] as { key: string; label: string }[],
}))
vi.mock("@/features/tasks/hooks/useTaskBoard", () => ({ useTaskBoard: () => board }))

import { ColumnsCard } from "@/features/agentic/components/settings/ColumnsCard"

const GO_COLUMNS = [
    { key: "backlog", label: "Backlog" },
    { key: "development", label: "Desenvolvimento" },
]

/** Dentro de um <form>, como na aba "Desenvolvimento agêntico" (AiEditorForm). */
function renderCard(value: string | null, onChange: (value: string | null) => void) {
    const card = (current: string | null) => (
        <form>
            <ColumnsCard
                title="Fila padrão"
                description="Fila"
                idPrefix="test"
                fields={[{ id: "test-col-queue", label: "Coluna que inicia a mesa automaticamente", noneLabel: "Nenhuma", value: current, onChange }]}
            />
        </form>
    )
    const view = render(card(value))
    return { ...view, rerenderWith: (next: string | null) => view.rerender(card(next)) }
}

const trigger = () => screen.getByRole("combobox")

afterEach(() => {
    cleanup()
    board.isLoading = true
    board.columns = []
})

describe("ColumnsCard: inicialização do valor salvo", () => {
    it("não altera o valor quando a coluna salva chega antes de ter opção (regressão MT-1)", () => {
        board.columns = [...GO_COLUMNS]
        const onChange = vi.fn()
        const { rerenderWith } = renderCard(null, onChange)
        // form.reset com a coluna pessoal salva, antes do quadro (colunas pessoais) carregar.
        rerenderWith("custom-fila")
        expect(onChange).not.toHaveBeenCalled()
    })

    it("mostra 'Carregando colunas…' enquanto o quadro carrega, em vez de ficar vazio", () => {
        board.columns = [...GO_COLUMNS]
        renderCard("custom-fila", vi.fn())
        expect(trigger().textContent).toContain("Carregando colunas…")
    })

    it("mostra o nome da coluna salva quando o quadro já a inclui", () => {
        board.isLoading = false
        board.columns = [...GO_COLUMNS, { key: "custom-fila", label: "Fila" }]
        renderCard("custom-fila", vi.fn())
        expect(trigger().textContent).toContain("Fila")
    })

    it("indica coluna removida quando o quadro carregou sem ela", () => {
        board.isLoading = false
        board.columns = [...GO_COLUMNS]
        renderCard("custom-apagada", vi.fn())
        expect(trigger().textContent).toContain("Coluna removida (custom-apagada)")
    })

    it("escolher a opção 'nada' continua enviando null", () => {
        board.isLoading = false
        board.columns = [...GO_COLUMNS]
        const onChange = vi.fn()
        const { container } = renderCard("development", onChange)
        const native = container.querySelector("select")
        expect(native).toBeTruthy()
        fireEvent.change(native!, { target: { value: "__none__" } })
        expect(onChange).toHaveBeenCalledWith(null)
    })
})
