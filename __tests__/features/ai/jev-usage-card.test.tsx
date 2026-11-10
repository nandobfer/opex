/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import { aiApiKeysMock, apiKeyDto } from "../../helpers/ai-api-keys"

const mocks = vi.hoisted(() => ({ usage: vi.fn(), refetch: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/ai/hooks/useAiApiKeys", () => aiApiKeysMock([apiKeyDto("key_aaaaaaaaaaaaaaaaaa", "Pessoal", true), apiKeyDto("key_bbbbbbbbbbbbbbbbbb", "Empresa")]))
vi.mock("@/features/ai/hooks/useJevUsage", () => ({ useJevUsage: mocks.usage }))
vi.mock("@/components/ui/preset-date-range-filter", async (importOriginal) => ({
    ...await importOriginal<typeof import("@/components/ui/preset-date-range-filter")>(),
    // Período fixo que NUNCA coincide com o padrão "Último mês" (hoje−1 mês … hoje): se coincidisse,
    // useUrlFilters omitiria o parâmetro igual ao padrão e o teste dependeria do dia em que roda.
    PresetDateRangeFilter: ({ onChange }: { onChange: (range: { startDate: string; endDate: string }) => void }) => <button type="button" onClick={() => onChange({ startDate: "2026-10-05", endDate: "2026-10-06" })}>Selecionar período personalizado</button>,
}))

import { JevUsageCard } from "@/features/ai/components/JevUsageCard"
import { DATE_PRESET } from "@/components/ui/preset-date-range-filter"
import { jevUsageRangeQuery } from "@/features/ai/jev-usage"

const summary = {
    requests: 149, failedRequests: 0, totalTokens: 235088, inputTokens: null, outputTokens: null, costUsd: 0.0067, reconstructedRequests: 149, missingTokenRequests: 0, missingCostRequests: 0,
    features: [
        { feature: "task-tags", label: "Tags de tarefas", requests: 141, inputTokens: null, outputTokens: null, totalTokens: 222000, costUsd: 0.0063 },
        { feature: "estimate-hours", label: "Estimar prazos", requests: 8, inputTokens: 12000, outputTokens: null, totalTokens: 13088, costUsd: 0.0004 },
    ],
}

beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/integracoes/ia/jev")
    mocks.usage.mockReturnValue({ data: summary, isLoading: false, isError: false, isFetching: false, refetch: mocks.refetch })
})
afterEach(cleanup)

describe("Consumo do JEV", () => {
    it("abre no último mês e apresenta custo preciso, total e aviso do histórico", () => {
        render(<JevUsageCard />)
        const period = DATE_PRESET.month.getRange()
        expect(mocks.usage).toHaveBeenLastCalledWith(jevUsageRangeQuery(period.startDate, period.endDate))
        expect(screen.getAllByText("235.088").length).toBeGreaterThan(0)
        expect(screen.getAllByText(/0,0067/).length).toBeGreaterThan(0)
        expect(screen.getAllByText("Não informado")).toHaveLength(2)
        expect(screen.getByRole("note").textContent).toContain("valores por período são aproximados")
        expect(screen.getByText(/Logs retidos por 90 dias/)).toBeTruthy()
    })

    it("troca o período na URL e refaz a consulta, preservando outros filtros", () => {
        window.history.replaceState(null, "", "/integracoes/ia/jev?aba=config")
        render(<JevUsageCard />)
        fireEvent.click(screen.getByRole("button", { name: "Selecionar período personalizado" }))
        expect(new URLSearchParams(window.location.search).get("usageFrom")).toBe("2026-10-05")
        expect(new URLSearchParams(window.location.search).get("aba")).toBe("config")
        expect(mocks.usage).toHaveBeenLastCalledWith(jevUsageRangeQuery("2026-10-05", "2026-10-06"))
        fireEvent.click(screen.getByRole("button", { name: "Atualizar" }))
        expect(mocks.refetch).toHaveBeenCalledOnce()
    })

    it("lista o consumo por recurso, com total do período e métricas ausentes como —", () => {
        render(<JevUsageCard />)
        expect(screen.getByRole("columnheader", { name: "Recurso" })).toBeTruthy()
        expect(screen.getByText("Tags de tarefas")).toBeTruthy()
        expect(screen.getByText("Estimar prazos")).toBeTruthy()
        expect(screen.getAllByText("Total").length).toBeGreaterThan(0)
        expect(screen.getAllByTitle("Métrica não informada").length).toBeGreaterThan(0)
    })

    it("mostra vazio com ação para selecionar outro período", () => {
        mocks.usage.mockReturnValue({ data: { ...summary, requests: 0, features: [] }, isLoading: false, isError: false, refetch: mocks.refetch })
        render(<JevUsageCard />)
        expect(screen.getByText("Nenhum uso do JEV neste período")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Último mês" })).toBeTruthy()
        expect(screen.queryByRole("columnheader", { name: "Recurso" })).toBeNull()
    })

    it("mostra skeleton e erro com tentar novamente", () => {
        mocks.usage.mockReturnValue({ isLoading: true, isError: false })
        const { rerender } = render(<JevUsageCard />)
        expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Carregando consumo")
        mocks.usage.mockReturnValue({ isLoading: false, isError: true, error: new Error("offline"), refetch: mocks.refetch })
        rerender(<JevUsageCard />)
        expect(screen.getByRole("alert")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }))
        expect(mocks.refetch).toHaveBeenCalledOnce()
    })

    it("não esconde registros com métricas faltantes e bloqueia período inválido", () => {
        mocks.usage.mockReturnValue({ data: { ...summary, reconstructedRequests: 0, missingTokenRequests: 2, missingCostRequests: 1 }, isLoading: false, isError: false })
        const { unmount } = render(<JevUsageCard />)
        expect(screen.getByRole("note").textContent).toContain("Totais parciais: 2 registro(s)")
        unmount()
        window.history.replaceState(null, "", "/integracoes/ia/jev?usageFrom=inválido")
        render(<JevUsageCard />)
        expect(mocks.usage).toHaveBeenLastCalledWith(null)
        expect(screen.getByText("Período inválido")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Atualizar" }).hasAttribute("disabled")).toBe(true)
    })

    it("filtro Chave de API (OPE-155): cards, tabela e Total vêm da consulta recortada pela chave", () => {
        window.history.replaceState(null, "", "/integracoes/ia/jev?aba=consumo&usageKey=key_aaaaaaaaaaaaaaaaaa")
        render(<JevUsageCard />)
        expect(screen.getByRole("combobox", { name: "Chave de API" }).textContent).toContain("Pessoal (em uso)")
        const call = mocks.usage.mock.calls.at(-1)![0] as Record<string, unknown>
        expect(call.apiKey).toBe("key_aaaaaaaaaaaaaaaaaa")
    })
})
