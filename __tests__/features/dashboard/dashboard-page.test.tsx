/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { DashboardDto } from "@/features/dashboard/types"

const mocks = vi.hoisted(() => ({
    query: {} as { data?: DashboardDto; isLoading: boolean; isError: boolean; isFetching: boolean; error: unknown; refetch: () => void },
}))

vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("@/features/dashboard/hooks/useDashboard", () => ({
    useDashboard: () => mocks.query,
    useDashboardRealtime: vi.fn(),
}))
vi.mock("@/features/dashboard/hooks/useDashboardPeriod", () => ({
    useDashboardPeriod: () => ({ period: "30d", setPeriod: vi.fn(), ready: true, range: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T23:59:59.999Z" }, timeZone: "UTC" }),
}))

import { DashboardPage } from "@/features/dashboard/components/DashboardPage"

const data = (): DashboardDto => ({
    range: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T23:59:59.999Z" },
    kpis: { tasksActive: 2, tasksInProgress: 1, tasksCompleted: 1, billingBrl: 400, clientHours: 4, loggedMinutes: 45, costUsd: 2, activeWorkbenches: 1, runningWorkbenches: 1 },
    tasksByColumn: [{ key: "todo", label: "A Fazer", color: "zinc", count: 2 }],
    tasksByType: [{ type: "feature", count: 2 }],
    tasksByProject: [{ projectId: "p1", name: "Portal", sigla: "POR", count: 2 }],
    tasksTimeline: [
        { bucket: "2026-10-05", created: 1, completed: 0 },
        { bucket: "2026-10-06", created: 0, completed: 1 },
    ],
    financeByClient: [{ clientId: "c1", clientName: "Acme", billingBrl: 400, clientHours: 4, taskCount: 1 }],
    financeTimeline: [{ bucket: "2026-10", billingBrl: 400 }],
    timeByDay: [{ bucket: "2026-10-05", minutes: 45, costUsd: 2 }],
    costByProject: [{ projectId: "p1", name: "Portal", sigla: "POR", minutes: 45, costUsd: 2 }],
    timeByStage: [{ stage: "implementing", label: "Implementando", minutes: 45 }],
    tokensByModel: [{ model: "openai/gpt", inputTokens: 100, outputTokens: 50, reasoningTokens: 10, totalTokens: 160 }],
    workbenchFunnel: [
        { step: "plan", label: "Plano", count: 0 },
        { step: "implement", label: "Implementação", count: 1 },
    ],
    workbenchByProject: [{ projectId: "p1", name: "Portal", sigla: "POR", count: 1 }],
    workbenchCostByProject: [{ projectId: "p1", name: "Portal", sigla: "POR", costUsd: 3 }],
})

beforeEach(() => {
    vi.clearAllMocks()
    mocks.query = { data: data(), isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn() }
})
afterEach(cleanup)

describe("DashboardPage", () => {
    it("renderiza os quatro blocos, os KPIs e os gráficos com nome acessível", () => {
        render(<DashboardPage />)

        expect(screen.getByRole("heading", { name: "Dashboards" })).toBeTruthy()
        for (const section of ["Visão geral de tarefas", "Financeiro", "Horas agênticas", "Central de desenvolvimento"]) {
            expect(screen.getByRole("heading", { name: section })).toBeTruthy()
        }
        expect(screen.getAllByText("R$ 400,00").length).toBeGreaterThan(0)
        expect(screen.getByRole("img", { name: "Tarefas por coluna" })).toBeTruthy()
        expect(screen.getByRole("img", { name: "Faturamento por cliente" })).toBeTruthy()
        expect(document.querySelectorAll("[data-barra]").length).toBeGreaterThan(0)
    })

    it("mostra o esqueleto durante o carregamento", () => {
        mocks.query = { data: undefined, isLoading: true, isError: false, isFetching: true, error: null, refetch: vi.fn() }
        render(<DashboardPage />)
        expect(screen.getByLabelText("Carregando dashboards")).toBeTruthy()
    })

    it("mostra erro acionável com Tentar novamente", () => {
        mocks.query = { data: undefined, isLoading: false, isError: true, isFetching: false, error: new Error("falhou"), refetch: vi.fn() }
        render(<DashboardPage />)
        expect(screen.getByRole("alert")).toBeTruthy()
        expect(screen.getByRole("button", { name: /Tentar novamente/ })).toBeTruthy()
    })
})
