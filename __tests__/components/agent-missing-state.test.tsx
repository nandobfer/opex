/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/api", () => ({ api: { post: mocks.post, get: vi.fn() }, apiErrorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback) }))

import { AgentMissingState } from "@/features/ai/components/memories/AgentMissingState"
import { agentMemoryStatusKey } from "@/features/ai/hooks/useAgentProvision"

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

function renderState(status: { exists: boolean; disabled: boolean }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidate = vi.spyOn(client, "invalidateQueries")
    render(<QueryClientProvider client={client}><AgentMissingState consumer="secretario" status={status} /></QueryClientProvider>)
    return { invalidate }
}

describe("AgentMissingState", () => {
    it("cadastra o agente e recarrega a existência e as consultas do Engramind", async () => {
        mocks.post.mockResolvedValueOnce({ data: { data: { id: "agent-memories", status: "ok", message: "Pronto" } } })
        const { invalidate } = renderState({ exists: false, disabled: false })
        expect(screen.getByText("Agente não encontrado no Engramind")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Cadastrar agente no Engramind" }))
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/ai/memories/agents/secretario/provision"))
        await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: agentMemoryStatusKey("secretario") }))
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["engramind"] })
    })

    it("passo com falha mostra a mensagem e Tentar novamente", async () => {
        mocks.post.mockResolvedValueOnce({ data: { data: { id: "agent-memories", status: "failed", message: "Engramind recusou o token" } } })
        renderState({ exists: false, disabled: false })
        fireEvent.click(screen.getByRole("button", { name: "Cadastrar agente no Engramind" }))
        await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Engramind recusou o token"))
        expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy()
    })

    it("agente desativado não oferece o cadastro", () => {
        renderState({ exists: true, disabled: true })
        expect(screen.queryByRole("button", { name: "Cadastrar agente no Engramind" })).toBeNull()
        expect(screen.getByText("Agente desativado no Engramind")).toBeTruthy()
    })
})
