/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
    enabledCalls: [] as boolean[],
    options: {} as { data?: { projects: { id: string; name: string; repo: string; sigla: string }[] }; isFetching: boolean; isError: boolean },
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/features/tasks/hooks/useTasks", async (original) => ({
    ...(await original<typeof import("@/features/tasks/hooks/useTasks")>()),
    // Espelha o `enabled` real: desabilitada, a consulta não devolve dados.
    useTaskOptions: (enabled = true) => {
        mocks.enabledCalls.push(enabled)
        return enabled ? mocks.options : { data: undefined, isFetching: false, isError: false }
    },
}))

import { TaskCreationActions } from "@/features/tasks/components/TaskCreationActions"

const withProject = { data: { projects: [{ id: "p1", name: "Portal", repo: "o/portal", sigla: "POR" }] }, isFetching: false, isError: false }

beforeEach(() => {
    vi.clearAllMocks()
    mocks.enabledCalls = []
    mocks.options = withProject
})
afterEach(cleanup)

describe("TaskCreationActions", () => {
    it("navega para as páginas próprias de prévia e de nova tarefa", () => {
        render(<TaskCreationActions />)
        fireEvent.click(screen.getByRole("button", { name: /Nova prévia/ }))
        expect(mocks.push).toHaveBeenCalledWith("/tarefas/previa")
        fireEvent.click(screen.getByRole("button", { name: /Nova tarefa/ }))
        expect(mocks.push).toHaveBeenCalledWith("/tarefas/nova")
    })

    it("sem repositório vinculado os dois botões ficam bloqueados, com a orientação e sem navegar", () => {
        mocks.options = { data: { projects: [] }, isFetching: false, isError: false }
        render(<TaskCreationActions />)

        const preview = screen.getByRole("button", { name: /Nova prévia/ }) as HTMLButtonElement
        const create = screen.getByRole("button", { name: /Nova tarefa/ }) as HTMLButtonElement
        expect(preview.disabled).toBe(true)
        expect(create.disabled).toBe(true)
        expect(preview.getAttribute("title")).toBe("Vincule um repositório em Integrações › GitHub")

        fireEvent.click(preview)
        fireEvent.click(create)
        expect(mocks.push).not.toHaveBeenCalled()
    })

    it("repassa `enabled` para as opções: desabilitado, as ações ficam bloqueadas", () => {
        render(<TaskCreationActions enabled={false} />)
        expect(mocks.enabledCalls).toContain(false)
        expect((screen.getByRole("button", { name: /Nova tarefa/ }) as HTMLButtonElement).disabled).toBe(true)
    })
})
