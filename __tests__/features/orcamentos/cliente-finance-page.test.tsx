/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ClienteFinanceDto } from "@/features/orcamentos/types"

/**
 * Financeiro do portal: mesmo padrão do Financeiro do dono — filtros no kit de listas (período e
 * repositórios na URL), cartão de totais e grupos expansíveis por repositório — sem horas reais.
 */

const mocks = vi.hoisted(() => ({
    query: {} as { data?: ClienteFinanceDto; isLoading: boolean; isError: boolean; isFetching: boolean; error: unknown; refetch: () => void },
    params: null as unknown,
    options: {} as { data?: { projects: unknown[] } },
}))

vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("@/features/orcamentos/portal/hooks", () => ({
    useClienteFinance: (params: unknown) => {
        mocks.params = params
        return mocks.query
    },
    useClienteOptions: () => mocks.options,
    useClienteRealtime: vi.fn(),
}))

import { ClienteFinanceiroPage } from "@/features/orcamentos/portal/ClienteFinanceiroPage"

const TASK = "a".repeat(24)

const data = (): ClienteFinanceDto => ({
    from: null,
    to: null,
    groups: [
        {
            projectId: "p1",
            repo: "o/portal",
            taskCount: 1,
            totalClientHours: 4,
            totalCostBrl: 400,
            tasks: [{ id: TASK, code: "OPX-1", title: "Portal interno", repo: "o/portal", projectId: "p1", clientHours: 4, costBrl: 400, completedAt: "2026-10-05T12:00:00.000Z" }],
        },
    ],
    totals: { taskCount: 1, totalClientHours: 4, totalCostBrl: 400 },
})

const emptyData = (): ClienteFinanceDto => ({ ...data(), groups: [], totals: { taskCount: 0, totalClientHours: 0, totalCostBrl: 0 } })

beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/cliente/financeiro")
    mocks.query = { data: data(), isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn() }
    mocks.params = null
    mocks.options = { data: { projects: [{ id: "p1", name: "Portal", repo: "o/portal", sigla: "POR", ownerAvatarUrl: null, description: null, private: false }] } }
})

afterEach(cleanup)

describe("ClienteFinanceiroPage", () => {
    it("mostra o cabeçalho, os filtros do kit de listas e os totais do período", () => {
        render(<ClienteFinanceiroPage />)

        expect(screen.getByRole("heading", { name: "Financeiro" })).toBeTruthy()
        expect(screen.getByText("Período")).toBeTruthy()
        expect(screen.getByText("Repositórios")).toBeTruthy()
        expect(screen.getByText("1 REGISTROS")).toBeTruthy()

        expect(screen.getByText("Custo no período")).toBeTruthy()
        expect(screen.getAllByText("R$ 400,00").length).toBeGreaterThan(0)
        expect(screen.getByText("Tarefas")).toBeTruthy()
    })

    it("consulta com o período padrão do mês corrente e sem repositório", () => {
        render(<ClienteFinanceiroPage />)

        expect(mocks.params).toMatchObject({ projectIds: [] })
        expect((mocks.params as { from: string }).from).not.toBe("")
    })

    it("lê o período e os repositórios da URL", () => {
        const projectId = "b".repeat(24)
        window.history.replaceState(null, "", `/cliente/financeiro?from=2026-03-01&to=2026-03-31&projectIds=${projectId}`)
        render(<ClienteFinanceiroPage />)

        expect(mocks.params).toMatchObject({ projectIds: [projectId] })
        // O período da URL vira ISO no início/fim do dia local.
        const from = new Date((mocks.params as { from: string }).from)
        expect([from.getDate(), from.getHours(), from.getMinutes()]).toEqual([1, 0, 0])
    })

    it("expande o repositório para listar as tarefas, sem horas reais nem fórmula interna", async () => {
        render(<ClienteFinanceiroPage />)
        expect(screen.queryByText("Portal interno")).toBeNull()

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /o\/portal/ }))
        })

        expect(screen.getByText("Portal interno")).toBeTruthy()
        expect(screen.getByText("OPX-1")).toBeTruthy()
        expect(screen.getByText("OPX-1").getAttribute("href")).toBe(`/cliente/tarefa/${TASK}`)
        expect(document.querySelector('[title="Horas no período"]')).toBeTruthy()
        expect(document.querySelector('[title="Horas reais (H)"]')).toBeNull()
    })

    it("sem conclusões mostra o vazio do período; com repositório selecionado, o vazio dos filtros", () => {
        mocks.query = { ...mocks.query, data: emptyData() }
        render(<ClienteFinanceiroPage />)
        expect(screen.getByText("Nenhuma tarefa concluída neste período")).toBeTruthy()

        cleanup()
        window.history.replaceState(null, "", `/cliente/financeiro?projectIds=${"b".repeat(24)}`)
        render(<ClienteFinanceiroPage />)
        expect(screen.getByText("Nenhuma tarefa para os filtros selecionados")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Limpar seleção" })).toBeTruthy()
    })

    it("erro mostra o aviso com tentar novamente", () => {
        mocks.query = { ...mocks.query, data: undefined, isError: true, error: new Error("falha") }
        render(<ClienteFinanceiroPage />)
        expect(screen.getByText("Não foi possível carregar o financeiro")).toBeTruthy()
    })

    it("no celular as métricas do grupo e os valores da tarefa vão para uma linha própria", async () => {
        render(<ClienteFinanceiroPage />)
        expect(screen.getByTestId("cliente-cost-group-metrics").className).toContain("max-md:basis-full")

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /o\/portal/ }))
        })

        const values = await screen.findByTestId("cliente-cost-task-values")
        expect(values.className).toContain("max-md:basis-full")
    })
})
