/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { InProgressWorkbenchDto } from "@/features/agentic/types"
import type { DashboardDto } from "@/features/dashboard/types"

const mocks = vi.hoisted(() => ({
    query: {} as { data?: DashboardDto; isLoading: boolean; isError: boolean; isFetching: boolean; error: unknown; refetch: () => void },
    push: vi.fn(),
    options: {} as { data?: { projects: { id: string; name: string; repo: string; sigla: string }[] }; isFetching: boolean; isError: boolean },
    workbenches: [] as InProgressWorkbenchDto[],
}))

vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/features/dashboard/hooks/useDashboard", () => ({
    useDashboard: () => mocks.query,
    useDashboardRealtime: vi.fn(),
}))
vi.mock("@/features/dashboard/hooks/useDashboardPeriod", () => ({
    useDashboardPeriod: () => ({ period: "30d", setPeriod: vi.fn(), ready: true, range: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T23:59:59.999Z" }, timeZone: "UTC" }),
}))
vi.mock("@/features/tasks/hooks/useTasks", async (original) => ({
    ...(await original<typeof import("@/features/tasks/hooks/useTasks")>()),
    useTaskOptions: () => mocks.options,
}))
vi.mock("@/features/agentic/hooks/useAgentic", async (original) => ({
    ...(await original<typeof import("@/features/agentic/hooks/useAgentic")>()),
    useWorkbenchesInProgress: () => ({ data: mocks.workbenches }),
    useWorkbenchProgressRealtime: vi.fn(),
}))
vi.mock("@/features/time/hooks/useTime", async (original) => ({
    ...(await original<typeof import("@/features/time/hooks/useTime")>()),
    useActiveTimers: () => ({ data: [] }),
    useTimeRealtime: vi.fn(),
}))

import DashboardLayout from "@/app/(app)/dashboard/layout"
import { DashboardPage } from "@/features/dashboard/components/DashboardPage"

const TASK = "a".repeat(24)

const workbench = (overrides: Partial<InProgressWorkbenchDto> = {}): InProgressWorkbenchDto => ({
    workbenchId: "wb-1",
    centralId: "c1",
    taskId: TASK,
    taskCode: "OPX-1",
    taskTitle: "Primeira",
    stage: "plan_review",
    runState: "idle",
    running: false,
    waitingFor: "Aguardando revisão do plano",
    ...overrides,
})

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
    mocks.options = { data: { projects: [{ id: "p1", name: "Portal", repo: "o/portal", sigla: "POR" }] }, isFetching: false, isError: false }
    mocks.workbenches = []
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

    it("mostra os atalhos globais e navega para as páginas próprias", () => {
        render(<DashboardPage />)
        expect(screen.getByRole("button", { name: /Nova prévia/ })).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: /Nova prévia/ }))
        expect(mocks.push).toHaveBeenCalledWith("/tarefas/previa")
        fireEvent.click(screen.getByRole("button", { name: /Nova tarefa/ }))
        expect(mocks.push).toHaveBeenCalledWith("/tarefas/nova")
    })

    it("oculta Atualizar no celular e deixa o período ocupar a linha inteira", () => {
        render(<DashboardPage />)
        expect(screen.getByRole("button", { name: "Atualizar indicadores" }).className).toContain("max-md:hidden")
        expect(screen.getByRole("radiogroup", { name: "Período" }).className).toContain("w-full md:w-auto")
    })

    it("mantém os atalhos disponíveis durante o carregamento dos indicadores", () => {
        mocks.query = { data: undefined, isLoading: true, isError: false, isFetching: true, error: null, refetch: vi.fn() }
        render(<DashboardPage />)
        expect(screen.getByRole("button", { name: /Nova prévia/ })).toBeTruthy()
        expect(screen.getByRole("button", { name: /Nova tarefa/ })).toBeTruthy()
    })
})

describe("DashboardPage: Trabalhos em andamento", () => {
    it("mostra o indicador com o link para a mesa e o motivo de espera", async () => {
        mocks.workbenches = [workbench()]
        render(
            <DashboardLayout>
                <DashboardPage />
            </DashboardLayout>,
        )

        fireEvent.click(await screen.findByRole("button", { name: "Aguardando ação em OPX-1" }))
        expect(await screen.findByText("Trabalhos em andamento")).toBeTruthy()
        expect(screen.getByRole("link", { name: "Abrir a mesa de OPX-1" }).getAttribute("href")).toBe(`/desenvolvimento/${TASK}`)
        expect(screen.getByText("Aguardando revisão do plano")).toBeTruthy()
    })

    it("sem trabalhos em andamento o indicador não aparece", () => {
        render(
            <DashboardLayout>
                <DashboardPage />
            </DashboardLayout>,
        )
        expect(screen.queryByRole("button", { name: /Trabalho em andamento|Aguardando ação/ })).toBeNull()
    })

    it("no celular o indicador ocupa a linha inteira (botão com largura total)", async () => {
        mocks.workbenches = [workbench()]
        render(
            <DashboardLayout>
                <DashboardPage />
            </DashboardLayout>,
        )
        const button = await screen.findByRole("button", { name: "Aguardando ação em OPX-1" })
        expect(button.className).toContain("max-md:w-full")
        expect(button.className).toContain("max-md:justify-center")
    })
})
