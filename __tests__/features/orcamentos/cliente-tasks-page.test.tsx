/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Tela de Tarefas do portal: o cabeçalho usa o mesmo botão de criação do Dashboard ("Nova tarefa"),
 * que abre `/cliente/nova` sem depender de repositório liberado.
 */

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
    options: {} as { data?: { projects: unknown[]; board?: unknown }; isLoading: boolean; error: unknown; refetch: () => void },
    tasks: {} as { data?: { tasks: unknown[] }; isLoading: boolean; isFetching: boolean; error: unknown; refetch: () => void },
}))

vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/features/orcamentos/portal/hooks", () => ({
    useClienteOptions: () => mocks.options,
    useClienteTasks: () => mocks.tasks,
    useClienteRealtime: vi.fn(),
    useSetClienteTaskPriority: () => ({ mutate: vi.fn(), isPending: false }),
}))
// Blocos pesados da tela que não interessam ao atalho de criação.
vi.mock("@/features/orcamentos/portal/components/ClienteFiltersBar", () => ({ ClienteFiltersBar: () => null }))
vi.mock("@/features/orcamentos/portal/components/ClienteTaskBoard", () => ({ ClienteTaskBoard: () => null }))
vi.mock("@/features/orcamentos/portal/components/ClienteTaskTable", () => ({ ClienteTaskTable: () => null }))
vi.mock("@/components/feedback/EmptyState", () => ({ EmptyState: () => null }))

import { ClienteTasksPage } from "@/features/orcamentos/portal/ClienteTasksPage"

beforeEach(() => {
    vi.clearAllMocks()
    mocks.options = { data: { projects: [] }, isLoading: false, error: null, refetch: vi.fn() }
    mocks.tasks = { data: { tasks: [] }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }
})
afterEach(cleanup)

describe("ClienteTasksPage", () => {
    it("usa o botão Nova tarefa, que abre a página de criação", () => {
        render(<ClienteTasksPage />)

        expect(screen.getByRole("heading", { name: "Tarefas" })).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: /Nova tarefa/ }))
        expect(mocks.push).toHaveBeenCalledWith("/cliente/nova")
    })

    it("sem repositório liberado, o botão Nova tarefa continua acionável", () => {
        render(<ClienteTasksPage />)

        const button = screen.getByRole("button", { name: /Nova tarefa/ }) as HTMLButtonElement
        expect(button.disabled).toBe(false)
    })
})
