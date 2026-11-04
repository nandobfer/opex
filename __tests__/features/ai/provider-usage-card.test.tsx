/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ usage: vi.fn(), refetch: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/ai/hooks/useProviderUsage", () => ({ useProviderUsage: mocks.usage }))
vi.mock("@/components/ui/preset-date-range-filter", async (importOriginal) => ({
    ...await importOriginal<typeof import("@/components/ui/preset-date-range-filter")>(),
    PresetDateRangeFilter: ({ onChange }: { onChange: (range: { startDate: string; endDate: string }) => void }) => <button type="button" onClick={() => onChange({ startDate: "2026-10-10", endDate: "2026-10-11" })}>Selecionar período personalizado</button>,
}))

import { ProviderUsageCard } from "@/features/ai/components/ProviderUsageCard"
import { DATE_PRESET } from "@/components/ui/preset-date-range-filter"
import { usageRangeQuery } from "@/features/ai/provider-usage"

const summary = {
    rows: [
        { key: "task-summary", label: "Resumos de tarefas", requests: 133, inputTokens: 1200000, outputTokens: 300000, totalTokens: 1500000, costUsd: null },
        { key: "budget-preview", label: "Orçamentos", requests: 35, inputTokens: null, outputTokens: null, totalTokens: 45000, costUsd: null },
    ],
    total: { requests: 168, inputTokens: 1200000, outputTokens: 300000, totalTokens: 1545000, costUsd: null },
    coverageFrom: "2026-10-12T12:00:00.000Z",
    missingInputRequests: 2,
    missingOutputRequests: 0,
    missingTokenRequests: 1,
    missingCostRequests: 168,
}

const card = () => (
    <ProviderUsageCard
        provider="gemini"
        title="Consumo do Gemini"
        description="Uso originado pelo Opex, por recurso. Este provedor não informa custo."
        firstColumnLabel="Recurso"
        emptyTitle="Nenhum uso do Gemini neste período"
        showCost={false}
        showCoverage
    />
)

beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/integracoes/ia/gemini?aba=consumo")
    mocks.usage.mockReturnValue({ data: summary, isLoading: false, isError: false, isFetching: false, refetch: mocks.refetch })
})
afterEach(cleanup)

describe("ProviderUsageCard", () => {
    it("abre no último mês e lista o consumo por recurso sem a coluna de custo", () => {
        render(card())
        const period = DATE_PRESET.month.getRange()
        expect(mocks.usage).toHaveBeenLastCalledWith("gemini", usageRangeQuery(period.startDate, period.endDate))
        expect(screen.getByText("Resumos de tarefas")).toBeTruthy()
        expect(screen.getByText("Orçamentos")).toBeTruthy()
        expect(screen.queryByRole("columnheader", { name: "Custo (USD)" })).toBeNull()
        expect(screen.getByRole("columnheader", { name: "Total" })).toBeTruthy()
        expect(screen.getAllByText("1,2M").length).toBeGreaterThan(0)
        expect(screen.getAllByTitle("1.200.000").length).toBeGreaterThan(0)
        expect(screen.getByText(/Medição iniciada em/)).toBeTruthy()
    })

    it("sinaliza métricas desconhecidas como — e avisa quando entrada ou saída somam apenas parte do período", () => {
        render(card())
        expect(screen.getAllByTitle("Métrica não informada").length).toBeGreaterThan(0)
        const note = screen.getByRole("note")
        expect(note.textContent).toContain("Totais parciais: 2 sem tokens de entrada e 1 sem tokens totais")
        expect(note.textContent).not.toContain("sem custo")
    })

    it("troca o período na URL e refaz a consulta", () => {
        render(card())
        fireEvent.click(screen.getByRole("button", { name: "Selecionar período personalizado" }))
        expect(new URLSearchParams(window.location.search).get("usageFrom")).toBe("2026-10-10")
        expect(new URLSearchParams(window.location.search).get("aba")).toBe("consumo")
        expect(mocks.usage).toHaveBeenLastCalledWith("gemini", usageRangeQuery("2026-10-10", "2026-10-11"))
        fireEvent.click(screen.getByRole("button", { name: "Atualizar" }))
        expect(mocks.refetch).toHaveBeenCalledOnce()
    })

    it("mostra vazio com ação para voltar ao último mês", () => {
        mocks.usage.mockReturnValue({ data: { ...summary, rows: [], total: { requests: 0, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null } }, isLoading: false, isError: false, refetch: mocks.refetch })
        render(card())
        expect(screen.getByText("Nenhum uso do Gemini neste período")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Último mês" })).toBeTruthy()
        expect(screen.queryByRole("columnheader", { name: "Recurso" })).toBeNull()
    })

    it("bloqueia período inválido sem consultar", () => {
        window.history.replaceState(null, "", "/integracoes/ia/gemini?aba=consumo&usageFrom=inválido")
        render(card())
        expect(mocks.usage).toHaveBeenLastCalledWith("gemini", null)
        expect(screen.getByText("Período inválido")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Atualizar" }).hasAttribute("disabled")).toBe(true)
    })
})
