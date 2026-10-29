/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ClienteDashboardDto } from "@/features/orcamentos/types"

/**
 * Dashboard do portal: mesma apresentação do dashboard do dono (cabeçalho, KPIs e os quatro gráficos
 * da visão geral de tarefas, com **tags** no lugar do tipo), com o atalho "Nova prévia" e o bloco
 * financeiro (custo) só para o admin do cliente.
 */

const mocks = vi.hoisted(() => ({
    query: {} as { data?: ClienteDashboardDto; isLoading: boolean; isError: boolean; isFetching: boolean; error: unknown; refetch: () => void },
    push: vi.fn(),
    isAdmin: true,
    options: {} as { data?: { projects: unknown[] } },
}))

vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/features/orcamentos/portal/ClientePortalContext", () => ({ useClientePortal: () => ({ isAdmin: mocks.isAdmin }) }))
vi.mock("@/features/orcamentos/portal/useClientePeriod", () => ({
    useClientePeriod: () => ({ period: "30d", setPeriod: vi.fn(), ready: true, range: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T23:59:59.999Z" }, timeZone: "UTC" }),
}))
vi.mock("@/features/orcamentos/portal/hooks", () => ({
    useClienteDashboard: () => mocks.query,
    useClienteRealtime: vi.fn(),
    useClienteOptions: () => mocks.options,
}))

import { ClienteDashboardPage } from "@/features/orcamentos/portal/ClienteDashboardPage"

const data = (): ClienteDashboardDto => ({
    range: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T23:59:59.999Z" },
    tasksCreated: 3,
    tasksActive: 4,
    tasksCompleted: 2,
    byColumn: [{ key: "todo", label: "A Fazer", color: "zinc", count: 3 }],
    byTag: [
        { tag: "ia", label: "IA", count: 2 },
        { tag: null, label: "Sem tags", count: 1 },
    ],
    byProject: [{ projectId: "p1", name: "Portal", sigla: "POR", count: 4 }],
    timeline: [
        { bucket: "2026-10-05", created: 1, completed: 0 },
        { bucket: "2026-10-06", created: 0, completed: 1 },
    ],
    finance: {
        totals: { totalCostBrl: 400, totalClientHours: 4, taskCount: 1 },
        byProject: [{ projectId: "p1", repo: "o/portal", costBrl: 400, clientHours: 4, taskCount: 1 }],
        timeline: [{ bucket: "2026-10", costBrl: 400 }],
    },
})

beforeEach(() => {
    vi.clearAllMocks()
    mocks.isAdmin = true
    mocks.query = { data: data(), isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn() }
    mocks.options = { data: { projects: [{ id: "p1", name: "Portal", repo: "o/portal", sigla: "POR", ownerAvatarUrl: null, description: null, private: false }] } }
})

afterEach(cleanup)

describe("ClienteDashboardPage", () => {
    it("usa o mesmo cabeçalho do dono e mostra os KPIs do cliente", () => {
        render(<ClienteDashboardPage />)

        expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy()
        for (const label of ["Tarefas ativas", "Criadas", "Concluídas"]) {
            // "Criadas"/"Concluídas" também aparecem na legenda do gráfico de linha.
            expect(screen.getAllByText(label).length).toBeGreaterThan(0)
        }
        // Seletor de período com as mesmas opções do dashboard do dono.
        for (const label of ["7 dias", "30 dias", "90 dias", "Mês atual"]) {
            expect(screen.getByRole("radio", { name: label })).toBeTruthy()
        }
        expect(screen.getByRole("button", { name: "Atualizar indicadores" })).toBeTruthy()
    })

    it("desenha os quatro gráficos do dono e usa tags no lugar do tipo", () => {
        render(<ClienteDashboardPage />)

        expect(screen.getByRole("heading", { name: "Visão geral de tarefas" })).toBeTruthy()
        for (const name of ["Tarefas por coluna", "Tarefas por tipo", "Tarefas por projeto", "Tarefas criadas e concluídas no período"]) {
            expect(screen.getByRole("img", { name })).toBeTruthy()
        }
        expect(document.querySelectorAll("[data-barra]").length).toBeGreaterThan(0)
        expect(screen.getByText("Sem tags")).toBeTruthy()
    })

    it("para o admin, mostra o custo nos KPIs e o bloco financeiro", () => {
        render(<ClienteDashboardPage />)

        expect(screen.getByText("Custo")).toBeTruthy()
        expect(screen.getAllByText("R$ 400,00").length).toBeGreaterThan(0)
        expect(screen.getByRole("heading", { name: "Financeiro" })).toBeTruthy()
        expect(screen.getByRole("img", { name: "Custo por repositório" })).toBeTruthy()
        expect(screen.getByRole("img", { name: "Horas por repositório" })).toBeTruthy()
    })

    it("para quem não é admin, não há custo, horas nem bloco financeiro", () => {
        mocks.isAdmin = false
        mocks.query = { ...mocks.query, data: { ...data(), finance: null } }
        render(<ClienteDashboardPage />)

        expect(screen.queryByText("Custo")).toBeNull()
        expect(screen.queryByRole("heading", { name: "Financeiro" })).toBeNull()
        expect(screen.queryByText("R$ 400,00")).toBeNull()
        // As distribuições continuam.
        expect(screen.getByRole("img", { name: "Tarefas por coluna" })).toBeTruthy()
    })

    it("tem apenas o atalho Nova prévia, que abre a página de nova prévia", () => {
        render(<ClienteDashboardPage />)

        expect(screen.queryByRole("button", { name: /Nova tarefa/ })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: /Nova prévia/ }))
        expect(mocks.push).toHaveBeenCalledWith("/cliente/nova")
    })

    it("sem repositório liberado, o atalho Nova prévia segue acionável (mesmo comportamento do de Tarefas)", () => {
        // Regressão: antes o atalho do dashboard ficava desabilitado sem repositório; agora é o mesmo
        // botão de Tarefas e não depende de repositórios liberados.
        mocks.options = { data: { projects: [] } }
        render(<ClienteDashboardPage />)

        const button = screen.getByRole("button", { name: /Nova prévia/ }) as HTMLButtonElement
        expect(button.disabled).toBe(false)
        expect(button.hasAttribute("title")).toBe(false)
        fireEvent.click(button)
        expect(mocks.push).toHaveBeenCalledWith("/cliente/nova")
    })

    it("esqueleto durante o carregamento e erro acionável", () => {
        mocks.query = { data: undefined, isLoading: true, isError: false, isFetching: true, error: null, refetch: vi.fn() }
        render(<ClienteDashboardPage />)
        expect(screen.getByLabelText("Carregando dashboard")).toBeTruthy()

        cleanup()
        mocks.query = { data: undefined, isLoading: false, isError: true, isFetching: false, error: new Error("falhou"), refetch: vi.fn() }
        render(<ClienteDashboardPage />)
        expect(screen.getByRole("alert")).toBeTruthy()
        expect(screen.getByRole("button", { name: /Tentar novamente/ })).toBeTruthy()
    })
})
