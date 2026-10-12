/** @vitest-environment jsdom */
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ usage: vi.fn(), refetch: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/ai/hooks/useOpencodeUsage", () => ({ useOpencodeUsage: mocks.usage }))
vi.mock("@/components/ui/preset-date-range-filter", async (importOriginal) => ({
    ...await importOriginal<typeof import("@/components/ui/preset-date-range-filter")>(),
    PresetDateRangeFilter: ({ onChange }: { onChange: (range: { startDate: string; endDate: string }) => void }) => <button type="button" onClick={() => onChange({ startDate: "2026-10-10", endDate: "2026-10-11" })}>Selecionar período personalizado</button>,
}))

import { OpencodeUsageCard } from "@/features/ai/components/OpencodeUsageCard"
import { DATE_PRESET } from "@/components/ui/preset-date-range-filter"
import { opencodeUsageRangeQuery } from "@/features/ai/opencode-usage"

const summary = {
    origins: [
        { origin: "agentic", label: "Desenvolvimento agêntico (mesas)", requests: 3, inputTokens: 300, outputTokens: 100, totalTokens: 450, costUsd: 0.01 },
        { origin: "refinement", label: "Refinar tarefa", requests: 1, inputTokens: null, outputTokens: null, totalTokens: 60, costUsd: null },
    ],
    total: { requests: 4, inputTokens: 300, outputTokens: 100, totalTokens: 510, costUsd: 0.01 },
    coverageFrom: "2026-10-12T12:00:00.000Z",
}

beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/integracoes/ia/opencode")
    mocks.usage.mockReturnValue({ data: summary, isLoading: false, isError: false, isFetching: false, refetch: mocks.refetch })
})
afterEach(cleanup)

describe("Consumo do OpenCode", () => {
    it("abre no último mês e lista o uso por origem com o total", () => {
        render(<OpencodeUsageCard />)
        const period = DATE_PRESET.month.getRange()
        expect(mocks.usage).toHaveBeenLastCalledWith(opencodeUsageRangeQuery(period.startDate, period.endDate))
        expect(screen.getByText("Desenvolvimento agêntico (mesas)")).toBeTruthy()
        expect(screen.getByText("Refinar tarefa")).toBeTruthy()
        expect(screen.getAllByText("Total").length).toBeGreaterThan(0)
        expect(screen.getByText(/Medição iniciada em/)).toBeTruthy()
    })

    it("troca o período na URL e refaz a consulta", () => {
        render(<OpencodeUsageCard />)
        fireEvent.click(screen.getByRole("button", { name: "Selecionar período personalizado" }))
        expect(new URLSearchParams(window.location.search).get("usageFrom")).toBe("2026-10-10")
        expect(mocks.usage).toHaveBeenLastCalledWith(opencodeUsageRangeQuery("2026-10-10", "2026-10-11"))
        fireEvent.click(screen.getByRole("button", { name: "Atualizar" }))
        expect(mocks.refetch).toHaveBeenCalledOnce()
    })

    it("mostra vazio quando não há uso no período", () => {
        mocks.usage.mockReturnValue({ data: { origins: [], total: { requests: 0, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, coverageFrom: null }, isLoading: false, isError: false, refetch: mocks.refetch })
        render(<OpencodeUsageCard />)
        expect(screen.getByText("Nenhum uso do OpenCode neste período")).toBeTruthy()
    })

    it("bloqueia período inválido", () => {
        window.history.replaceState(null, "", "/integracoes/ia/opencode?usageFrom=inválido")
        render(<OpencodeUsageCard />)
        expect(mocks.usage).toHaveBeenLastCalledWith(null)
        expect(screen.getByText("Período inválido")).toBeTruthy()
    })
})
