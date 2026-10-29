/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import type { PrReviewDto, PrReviewListDto } from "@/features/pr-review/types"

const mocks = vi.hoisted(() => ({ pages: vi.fn(), settings: vi.fn(), mutate: vi.fn(), refetch: vi.fn(), fetchNextPage: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/pr-review/hooks/usePrReview", () => ({
    usePrReviewPages: mocks.pages,
    usePrReviewSettings: mocks.settings,
    usePrReviewRealtime: vi.fn(),
    usePrReviewAction: () => ({ mutate: mocks.mutate, isPending: false }),
}))
vi.mock("@/features/pr-review/components/PrReviewDetailDialog", () => ({
    PrReviewDetailDialog: ({ id }: { id: string | null }) => (id ? <div role="dialog" aria-label="Detalhe da revisão">{id}</div> : null),
}))
vi.mock("@/features/pr-review/components/RequestPrReviewDialog", () => ({
    RequestPrReviewDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Revisar PR pela URL" /> : null),
}))

import { PrReviewsPage } from "@/features/pr-review/components/PrReviewsPage"

const review = (overrides: Partial<PrReviewDto>): PrReviewDto => ({
    id: "r1",
    repo: "org/app",
    number: 12,
    url: "https://github.com/org/app/pull/12",
    title: "Corrige login",
    author: "ana",
    headSha: "abcdef1234",
    draft: false,
    projectName: "App",
    workbenchId: null,
    trigger: "auto",
    state: "done",
    verdict: "approved",
    blocking: 0,
    summary: null,
    error: null,
    costUsd: 0,
    durationMs: 1000,
    createdAt: "2026-10-28T12:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    ...overrides,
})

const page = (items: PrReviewDto[]): PrReviewListDto => ({ items, page: 1, limit: 20, total: items.length, totalPages: 1, githubLogin: "eu", repos: [{ repo: "org/app", projectName: "App", enabled: true }] })

const result = (data: PrReviewListDto | undefined, extra: Record<string, unknown> = {}) => ({
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
    window.history.replaceState(null, "", "/agente-revisor")
    mocks.settings.mockReturnValue({ data: { availability: { available: true, reason: null } } })
    mocks.pages.mockReturnValue(result(page([review({ id: "r1" }), review({ id: "r2", number: 13, state: "running", verdict: null, title: "Nova tela" })])))
})
afterEach(cleanup)

describe("página Agente Revisor", () => {
    it("lista as revisões com os filtros padrão, repositórios acompanhados e o atalho para a configuração", () => {
        render(<PrReviewsPage />)
        expect(screen.getByRole("heading", { name: "Agente Revisor" })).toBeTruthy()
        expect(screen.getByText("Corrige login")).toBeTruthy()
        expect(screen.getByText("Nova tela")).toBeTruthy()
        expect(screen.getByText("Filtros")).toBeTruthy()
        expect(screen.getByLabelText("Repositórios acompanhados").textContent).toContain("org/app")
        expect(screen.getByRole("link", { name: /Configurar/ }).getAttribute("href")).toBe("/integracoes/ia?aba=revisao-pr")
        expect(mocks.pages).toHaveBeenLastCalledWith({})
    })

    it("mantém Ver, Revisar de novo, Parar (com confirmação) e Revisar PR", () => {
        render(<PrReviewsPage />)
        const list = screen.getByRole("list", { name: "Revisões do Agente Revisor" })
        const [done, running] = within(list).getAllByRole("listitem")

        fireEvent.click(within(done!).getByRole("button", { name: /Ver/ }))
        expect(screen.getByRole("dialog", { name: "Detalhe da revisão" }).textContent).toBe("r1")

        fireEvent.click(within(done!).getByRole("button", { name: /Revisar de novo/ }))
        expect(mocks.mutate).toHaveBeenCalledWith({ id: "r1", action: "rerun" })

        fireEvent.click(within(running!).getByRole("button", { name: /Parar/ }))
        expect(mocks.mutate).not.toHaveBeenCalledWith({ id: "r2", action: "stop" })
        fireEvent.click(screen.getByRole("button", { name: "Parar" }))
        expect(mocks.mutate).toHaveBeenCalledWith({ id: "r2", action: "stop" })

        fireEvent.click(screen.getByRole("button", { name: /Revisar PR/ }))
        expect(screen.getByRole("dialog", { name: "Revisar PR pela URL" })).toBeTruthy()
    })

    it("filtros da URL vão para a consulta; vazio com filtro oferece limpar", () => {
        window.history.replaceState(null, "", "/agente-revisor?states=failed&q=login")
        mocks.pages.mockReturnValue(result(page([])))
        render(<PrReviewsPage />)
        expect(mocks.pages).toHaveBeenLastCalledWith({ q: "login", states: "failed" })
        expect(screen.getByText("Nenhuma revisão com estes filtros")).toBeTruthy()
        fireEvent.click(screen.getAllByRole("button", { name: "Limpar filtros" }).at(-1)!)
        expect(window.location.search).toBe("")
        expect(mocks.pages).toHaveBeenLastCalledWith({})
    })

    it("indisponível: Revisar PR desabilitado e o motivo aparece", () => {
        mocks.settings.mockReturnValue({ data: { availability: { available: false, reason: "Ative o Agente Revisor" } } })
        render(<PrReviewsPage />)
        expect(screen.getByRole("button", { name: /Revisar PR/ }).hasAttribute("disabled")).toBe(true)
        expect(screen.getByText("Ative o Agente Revisor")).toBeTruthy()
    })

    it("erro ao carregar mostra tentar novamente", () => {
        mocks.pages.mockReturnValue(result(undefined, { isError: true, error: new Error("falhou") }))
        render(<PrReviewsPage />)
        expect(screen.getByText("Não foi possível carregar as revisões")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }))
        expect(mocks.refetch).toHaveBeenCalled()
    })
})
