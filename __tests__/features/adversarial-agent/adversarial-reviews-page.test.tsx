/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import type { AdversarialReviewDto, AdversarialReviewListDto } from "@/features/adversarial-agent/types"

const mocks = vi.hoisted(() => ({ pages: vi.fn(), settings: vi.fn(), refetch: vi.fn(), fetchNextPage: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/adversarial-agent/hooks/useAdversarial", () => ({
    useAdversarialReviewPages: mocks.pages,
    useAdversarialSettings: mocks.settings,
    useAdversarialRealtime: vi.fn(),
}))
vi.mock("@/features/adversarial-agent/components/ReviewDetailDialog", () => ({
    ReviewDetailDialog: ({ id }: { id: string | null }) => (id ? <div role="dialog" aria-label="Detalhe da rodada">{id}</div> : null),
}))
vi.mock("@/features/adversarial-agent/components/settings/MemoriesSection", () => ({
    MemoriesSection: () => <div aria-label="Memórias do Agente Adversário">lista adversarial</div>,
}))

import { AdversarialReviewsPage } from "@/features/adversarial-agent/components/page/AdversarialReviewsPage"

const review = (overrides: Partial<AdversarialReviewDto>): AdversarialReviewDto => ({
    id: "a1",
    workbenchId: "w1",
    centralId: "0123456789abcdef01234567",
    taskId: "t1",
    taskCode: "OPE-10",
    taskTitle: "Corrige login",
    cycle: 1,
    round: 1,
    level: "balanced",
    state: "done",
    decision: "approved",
    limitReached: false,
    summary: null,
    blocking: 0,
    counts: { critical: 0, high: 1, medium: 0, low: 0, nit: 0 },
    error: null,
    costUsd: 0.01,
    durationMs: 1000,
    createdAt: "2026-10-28T12:00:00.000Z",
    finishedAt: null,
    ...overrides,
})

const page = (items: AdversarialReviewDto[]): AdversarialReviewListDto => ({ items, page: 1, limit: 20, total: items.length, totalPages: 1, centrals: [{ id: "0123456789abcdef01234567", projectName: "App" }] })

const result = (data: AdversarialReviewListDto | undefined, extra: Record<string, unknown> = {}) => ({
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
    window.history.replaceState(null, "", "/agente-adversario")
    mocks.settings.mockReturnValue({ data: { availability: { available: true, reason: null } } })
    mocks.pages.mockReturnValue(result(page([review({ id: "a1" }), review({ id: "a2", taskCode: "OPE-11", taskTitle: "Nova tela", state: "running", decision: null })])))
})
afterEach(cleanup)

describe("página Agente Adversário", () => {
    it("lista as rodadas com os filtros padrão e o atalho para a configuração", () => {
        render(<AdversarialReviewsPage />)
        expect(screen.getByRole("heading", { name: "Agente Adversário" })).toBeTruthy()
        expect(screen.getByText("Corrige login")).toBeTruthy()
        expect(screen.getByText("Nova tela")).toBeTruthy()
        expect(screen.getByText("Filtros")).toBeTruthy()
        expect(screen.getByRole("link", { name: /Configurar/ }).getAttribute("href")).toBe("/integracoes/ia?aba=agente-adversario")
        expect(mocks.pages).toHaveBeenLastCalledWith({})
    })

    it("Ver abre o detalhe da rodada", () => {
        render(<AdversarialReviewsPage />)
        const list = screen.getByRole("list", { name: "Revisões do agente adversário" })
        const [first] = within(list).getAllByRole("listitem")
        fireEvent.click(within(first!).getByRole("button", { name: /Ver/ }))
        expect(screen.getByRole("dialog", { name: "Detalhe da rodada" }).textContent).toBe("a1")
    })

    it("filtros da URL vão para a consulta; vazio com filtro oferece limpar", () => {
        window.history.replaceState(null, "", "/agente-adversario?decisions=failed&q=login")
        mocks.pages.mockReturnValue(result(page([])))
        render(<AdversarialReviewsPage />)
        expect(mocks.pages).toHaveBeenLastCalledWith({ q: "login", decisions: "failed" })
        expect(screen.getByText("Nenhuma revisão com estes filtros")).toBeTruthy()
        fireEvent.click(screen.getAllByRole("button", { name: "Limpar filtros" }).at(-1)!)
        expect(window.location.search).toBe("")
        expect(mocks.pages).toHaveBeenLastCalledWith({})
    })

    it("sem rodadas e sem filtro: estado vazio explicativo", () => {
        mocks.pages.mockReturnValue(result(page([])))
        render(<AdversarialReviewsPage />)
        expect(screen.getByText("Nenhuma revisão ainda")).toBeTruthy()
    })

    it("aba Memórias mostra a lista do adversário e fica na URL; voltar para Revisões mantém os filtros", () => {
        window.history.replaceState(null, "", "/agente-adversario?q=login")
        render(<AdversarialReviewsPage />)
        fireEvent.click(screen.getByRole("radio", { name: "Memórias" }))
        expect(screen.getByLabelText("Memórias do Agente Adversário")).toBeTruthy()
        expect(screen.queryByText("Filtros")).toBeNull()
        expect(new URLSearchParams(window.location.search).get("aba")).toBe("memorias")
        expect(new URLSearchParams(window.location.search).get("q")).toBe("login")
        fireEvent.click(screen.getByRole("radio", { name: "Revisões" }))
        expect(screen.getByText("Corrige login")).toBeTruthy()
        expect(new URLSearchParams(window.location.search).has("aba")).toBe(false)
    })

    it("?aba=memorias abre direto nas memórias", () => {
        window.history.replaceState(null, "", "/agente-adversario?aba=memorias")
        render(<AdversarialReviewsPage />)
        expect(screen.getByLabelText("Memórias do Agente Adversário")).toBeTruthy()
    })

    it("erro ao carregar mostra tentar novamente; indisponível mostra o motivo", () => {
        mocks.settings.mockReturnValue({ data: { availability: { available: false, reason: "Ative o Agente Adversário" } } })
        mocks.pages.mockReturnValue(result(undefined, { isError: true, error: new Error("falhou") }))
        render(<AdversarialReviewsPage />)
        expect(screen.getByText("Ative o Agente Adversário")).toBeTruthy()
        expect(screen.getByText("Não foi possível carregar as revisões")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }))
        expect(mocks.refetch).toHaveBeenCalled()
    })
})
