/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Botão de criação do portal compartilhado por Tarefas ("Nova tarefa") e Dashboard ("Nova prévia"):
 * mesma estrutura e mesma navegação (`/cliente/nova`), mudando apenas rótulo e estilo.
 */

const mocks = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))

import { ClienteTaskCreationButton } from "@/features/orcamentos/portal/components/ClienteTaskCreationButton"

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe("ClienteTaskCreationButton", () => {
    it("na apresentação de tarefa, mostra Nova tarefa no estilo primário e abre a página de criação", () => {
        render(<ClienteTaskCreationButton appearance="task" />)

        const button = screen.getByRole("button", { name: /Nova tarefa/ }) as HTMLButtonElement
        expect(button.disabled).toBe(false)
        expect(button.getAttribute("type")).toBe("button")
        expect(button.classList.contains("bg-primary")).toBe(true)

        fireEvent.click(button)
        expect(mocks.push).toHaveBeenCalledWith("/cliente/nova")
    })

    it("na apresentação de prévia, mostra Nova prévia no estilo outline e abre a mesma página", () => {
        render(<ClienteTaskCreationButton appearance="preview" />)

        const button = screen.getByRole("button", { name: /Nova prévia/ }) as HTMLButtonElement
        expect(button.disabled).toBe(false)
        expect(button.classList.contains("border")).toBe(true)
        expect(button.classList.contains("bg-primary")).toBe(false)

        fireEvent.click(button)
        expect(mocks.push).toHaveBeenCalledWith("/cliente/nova")
    })

    it("só muda o rótulo e o estilo: as duas apresentações navegam para o mesmo destino", () => {
        render(
            <>
                <ClienteTaskCreationButton appearance="task" />
                <ClienteTaskCreationButton appearance="preview" />
            </>,
        )

        fireEvent.click(screen.getByRole("button", { name: /Nova tarefa/ }))
        fireEvent.click(screen.getByRole("button", { name: /Nova prévia/ }))

        expect(mocks.push).toHaveBeenCalledTimes(2)
        expect(mocks.push).toHaveBeenNthCalledWith(1, "/cliente/nova")
        expect(mocks.push).toHaveBeenNthCalledWith(2, "/cliente/nova")
    })

    it("sem repositório liberado o botão continua acionável (não depende de repositórios)", () => {
        render(<ClienteTaskCreationButton appearance="preview" />)

        const button = screen.getByRole("button", { name: /Nova prévia/ }) as HTMLButtonElement
        expect(button.disabled).toBe(false)
        expect(button.hasAttribute("title")).toBe(false)
    })
})
