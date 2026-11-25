// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ query: vi.fn(), refetch: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/evolution-api/hooks/useEvolution", () => ({ useEvolution: mocks.query, useEvolutionAction: () => ({ mutate: vi.fn() }) }))
vi.mock("@/features/secretary-agent/components/criteria/DecisionModelCard", () => ({ DecisionModelCard: () => null }))

import { DecisionLog } from "@/features/secretary-agent/components/CriteriaTab"
import { NoticesTab } from "@/features/secretary-agent/components/ConversationTabs"

afterEach(() => { cleanup(); vi.resetAllMocks() })

it("mostra skeletons, depois estados vazios com ação de atualizar", () => {
    mocks.query.mockReturnValue({ isPending: true })
    const view = () => <><DecisionLog contacts={[]} /><NoticesTab /></>
    const { rerender } = render(view())
    expect(screen.getByRole("status", { name: "Carregando decisões" })).toBeTruthy()
    expect(screen.getByRole("status", { name: "Carregando avisos" })).toBeTruthy()
    mocks.query.mockImplementation((path: string) => ({ data: path.endsWith("notices") ? { pending: 0, items: [] } : [], refetch: mocks.refetch }))
    rerender(view())
    expect(screen.getByText("Nenhuma decisão registrada.")).toBeTruthy()
    expect(screen.getByText("Nenhum aviso registrado.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Atualizar decisões" }))
    fireEvent.click(screen.getByRole("button", { name: "Atualizar avisos" }))
    expect(mocks.refetch).toHaveBeenCalledTimes(2)
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
