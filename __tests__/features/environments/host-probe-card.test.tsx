/** @vitest-environment jsdom */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
const mocks = vi.hoisted(() => ({ post: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock("@/lib/api", () => ({
    api: { post: mocks.post },
    unwrapApi: (body: { data: unknown }) => body.data,
    apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}))
import { HostProbeCard } from "@/features/environments/components/HostProbeCard"

const renderCard = (dirty = false) =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
            <HostProbeCard dirty={dirty} />
        </QueryClientProvider>,
    )
afterEach(cleanup)

describe("Testar acesso ao host", () => {
    it("mostra cada verificação com o resultado e o detalhe", async () => {
        mocks.post.mockResolvedValueOnce({
            data: {
                success: true,
                data: {
                    ok: false,
                    checks: [
                        { name: "Diretório de acesso", ok: true, detail: "Gravado e lido em /tmp/opex-environments/probe-1 (0700)." },
                        { name: "Docker", ok: false, detail: "Docker indisponível para o usuário do OpenCode." },
                    ],
                },
            },
        })
        renderCard()
        fireEvent.click(screen.getByRole("button", { name: /Testar acesso/ }))
        expect(await screen.findByText("Com pendências")).toBeTruthy()
        const list = screen.getByRole("list", { name: "Verificações do host" })
        expect(list.textContent).toContain("Gravado e lido em /tmp/opex-environments/probe-1")
        expect(list.textContent).toContain("Docker indisponível")
        expect(mocks.post).toHaveBeenCalledWith("/environments/access-probe")
        expect(mocks.error).toHaveBeenCalled()
    })
    it("com alterações não salvas o teste fica bloqueado e explica o motivo", () => {
        renderCard(true)
        expect((screen.getByRole("button", { name: /Testar acesso/ }) as HTMLButtonElement).disabled).toBe(true)
        expect(screen.getByText(/Salve as alterações antes de testar/)).toBeTruthy()
    })
})
