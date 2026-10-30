/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import type { MentorRunDto, MentorRunListDto } from "@/features/adversarial-agent/mentor/types"

const mocks = vi.hoisted(() => ({ pages: vi.fn(), settings: vi.fn(), refetch: vi.fn(), fetchNextPage: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/adversarial-agent/hooks/useMentor", () => ({
    useMentorRunPages: mocks.pages,
    useMentorSettings: mocks.settings,
    useMentorRealtime: vi.fn(),
}))
vi.mock("@/features/adversarial-agent/components/mentor/MentorRunDialog", () => ({
    MentorRunDialog: ({ run }: { run: MentorRunDto | null }) => (run ? <div role="dialog" aria-label="Execução do Mentor">{run.id}</div> : null),
}))

import { MentorRunsPage } from "@/features/adversarial-agent/components/mentor/MentorRunsPage"

const run = (overrides: Partial<MentorRunDto>): MentorRunDto => ({
    id: "m1",
    workbenchId: "w1",
    taskId: "t1",
    taskCode: "OPE-20",
    taskTitle: "Tarefa",
    sources: ["user"],
    trigger: "preview_correction",
    userMessage: null,
    lessonCount: 0,
    status: "created",
    level: "balanced",
    score: 0.9,
    threshold: 0.65,
    deciderReason: null,
    writerAction: "create",
    writerReason: null,
    sanitizerReason: null,
    proposal: null,
    memoryId: "mem1",
    error: null,
    costUsd: 0.01,
    durationMs: 1000,
    createdAt: "2026-10-28T12:00:00.000Z",
    finishedAt: null,
    ...overrides,
})

const page = (items: MentorRunDto[], total = items.length): MentorRunListDto => ({ items, page: 1, limit: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)), centrals: [] })

const result = (data: MentorRunListDto | undefined, extra: Record<string, unknown> = {}) => ({
    data: data ? { pages: [data] } : undefined,
    isLoading: false,
    isError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: mocks.fetchNextPage,
    refetch: mocks.refetch,
    ...extra,
})

beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/agente-mentor")
    mocks.settings.mockReturnValue({ data: { availability: { available: true, reason: null } } })
    mocks.pages.mockReturnValue(result(page([run({ id: "m1" }), run({ id: "m2", taskCode: "OPE-21", status: "suggested", proposal: { action: "create", memoryId: null, text: "Regra" } })])))
})
afterEach(cleanup)

describe("página Agente Mentor", () => {
    it("lista as execuções com os filtros e o atalho para a configuração", () => {
        render(<MentorRunsPage />)
        expect(screen.getByRole("heading", { name: "Agente Mentor" })).toBeTruthy()
        expect(screen.getByText("OPE-20")).toBeTruthy()
        expect(screen.getByText("Filtros")).toBeTruthy()
        expect(screen.getByRole("link", { name: /Configurar/ }).getAttribute("href")).toBe("/integracoes/ia?aba=agente-mentor")
        expect(mocks.pages).toHaveBeenLastCalledWith({})
    })

    it("sugestão mostra Decidir e abre a execução", () => {
        render(<MentorRunsPage />)
        const items = within(screen.getByRole("list", { name: "Execuções do Agente Mentor" })).getAllByRole("listitem")
        expect(within(items[0]!).getByRole("button", { name: /Ver/ }).textContent).toContain("Ver")
        const decide = within(items[1]!).getByRole("button", { name: /OPE-21/ })
        expect(decide.textContent).toContain("Decidir")
        fireEvent.click(decide)
        expect(screen.getByRole("dialog", { name: "Execução do Mentor" }).textContent).toBe("m2")
    })

    it("filtros da URL vão para a consulta; vazio com filtro oferece limpar", () => {
        window.history.replaceState(null, "", "/agente-mentor?statuses=failed&sources=developer")
        mocks.pages.mockReturnValue(result(page([])))
        render(<MentorRunsPage />)
        expect(mocks.pages).toHaveBeenLastCalledWith({ statuses: "failed", sources: "developer" })
        expect(screen.getByText("Nenhuma execução com estes filtros")).toBeTruthy()
        fireEvent.click(screen.getAllByRole("button", { name: "Limpar filtros" }).at(-1)!)
        expect(window.location.search).toBe("")
    })

    it("sem IntersectionObserver ou com erro na próxima página: Carregar mais (x de y)", () => {
        mocks.pages.mockReturnValue(result(page([run({ id: "m1" })], 30), { hasNextPage: true, isFetchNextPageError: true }))
        render(<MentorRunsPage />)
        fireEvent.click(screen.getByRole("button", { name: "Carregar mais (1 de 30)" }))
        expect(mocks.fetchNextPage).toHaveBeenCalled()
    })

    it("carregando mostra o skeleton; erro mostra tentar novamente", () => {
        mocks.pages.mockReturnValue(result(undefined, { isLoading: true }))
        const { unmount } = render(<MentorRunsPage />)
        expect(screen.getByLabelText("Carregando execuções")).toBeTruthy()
        unmount()
        mocks.pages.mockReturnValue(result(undefined, { isError: true, error: new Error("falhou") }))
        render(<MentorRunsPage />)
        fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }))
        expect(mocks.refetch).toHaveBeenCalled()
    })
})
