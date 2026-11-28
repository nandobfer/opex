// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
// OPE-206: a instância do dono nos nomes antigos.
vi.mock('@/features/engramind/hooks/useChannelNamespace', () => ({ useChannelNamespace: () => ({ data: { app: 'opex', prefixed: false }, isError: false }) }))
import { framerMotionMock } from "../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ query: vi.fn(), refetch: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/evolution-api/hooks/useEvolution", () => ({ useEvolution: mocks.query, useEvolutionAction: () => ({ mutate: vi.fn() }) }))

// O registro de decisões saiu da aba Critérios para a aba Decisões (OPE-197): estados em secretary-decisions-tab.test.tsx.
import { NoticesTab } from "@/features/secretary-agent/components/NoticesTab"

afterEach(() => { cleanup(); vi.resetAllMocks() })

it("mostra skeletons, depois estado vazio com ação de atualizar", () => {
    mocks.query.mockReturnValue({ isPending: true })
    const { rerender } = render(<NoticesTab />)
    expect(screen.getByRole("status", { name: "Carregando avisos" })).toBeTruthy()
    mocks.query.mockImplementation(() => ({ data: { pending: 0, items: [] }, refetch: mocks.refetch }))
    rerender(<NoticesTab />)
    expect(screen.getByText("Nenhum aviso registrado.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Atualizar avisos" }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
})

it("apresenta nome, foto, autor e trecho no aviso", () => {
    const pictureUrl = "https://example.test/foto.jpg"
    mocks.query.mockReturnValue({ data: { pending: 1, items: [{ _id: "1", kind: "question", status: "pending", text: "Vai?", author: "João", excerpt: "[áudio]\nNo sábado?", contact: { name: "Família", isGroup: true, pictureUrl } }] } })
    const { container } = render(<NoticesTab />)
    expect(screen.getByText("Família")).toBeTruthy()
    expect(container.querySelector("img")?.getAttribute("src")).toBe(pictureUrl)
    expect(screen.getByText(/João/)).toBeTruthy()
    expect(screen.getByText(/No sábado/)).toBeTruthy()
})
