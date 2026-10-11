import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryModel } from "../../helpers/memory-model"

const mocks = vi.hoisted(() => ({
    concludedColumnKeys: vi.fn(),
    finance: vi.fn(),
    models: {} as Record<string, MemoryModel>,
}))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/features/tasks/server/service", () => ({ concludedColumnKeys: mocks.concludedColumnKeys, TASK_AUDIT_ENTITY: "Tarefa" }))
vi.mock("@/features/finance/server/service", () => ({ listFinanceByClient: mocks.finance }))
vi.mock("@/lib/db/models/DevTask", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.task = memoryModel()
    return { DevTask: mocks.models.task }
})
vi.mock("@/lib/db/models/AuditLog", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.audit = memoryModel()
    return { AuditLog: mocks.models.audit }
})
vi.mock("@/lib/db/models/Project", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.project = memoryModel()
    return { Project: mocks.models.project }
})
vi.mock("@/lib/db/models/TaskBoard", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.column = memoryModel()
    mocks.models.layout = memoryModel()
    return { TaskBoardColumn: mocks.models.column, TaskBoardLayout: mocks.models.layout }
})
vi.mock("@/lib/db/models/TimeLog", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.timeLog = memoryModel()
    return { TimeLog: mocks.models.timeLog }
})
vi.mock("@/lib/db/models/Agentic", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.central = memoryModel()
    mocks.models.workbench = memoryModel()
    return { AgenticCentral: mocks.models.central, AgenticWorkbench: mocks.models.workbench }
})

import { buildDashboard } from "@/features/dashboard/server/service"

const RANGE = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T23:59:59.999Z", timeZone: "UTC" }

const emptyFinance = { from: RANGE.from, to: RANGE.to, groups: [], totals: { taskCount: 0, totalHours: 0, totalClientHours: 0, totalBillingBrl: 0 } }

async function seed() {
    await mocks.models.column.create({ key: "todo", name: "A Fazer", color: "zinc" })
    await mocks.models.column.create({ key: "done", name: "Concluído", color: "emerald" })
    const project = await mocks.models.project.create({ name: "Portal", sigla: "POR" })
    const todo = await mocks.models.task.create({ code: "POR-1", columnId: "todo", taskType: "feature", projectId: String(project._id), createdAt: new Date("2026-10-05T09:00:00.000Z") })
    const done = await mocks.models.task.create({ code: "POR-2", columnId: "done", taskType: "bugfix", projectId: String(project._id), createdAt: new Date("2026-10-06T09:00:00.000Z") })
    await mocks.models.audit.create({ entidade: "Tarefa", entidadeId: String(done._id), acao: "MOVER", dadosAnteriores: { coluna: "A Fazer" }, dadosNovos: { coluna: "Concluído" }, timestamp: new Date("2026-10-10T12:00:00.000Z") })
    await mocks.models.timeLog.create({ taskId: String(todo._id), stage: "implementing", model: "openai/gpt", duration: 45, costUsd: 2, inputTokens: 100, outputTokens: 50, reasoningTokens: 10, startTime: new Date("2026-10-05T12:00:00.000Z") })
    const central = await mocks.models.central.create({ projectId: String(project._id), projectName: "Portal" })
    await mocks.models.workbench.create({ stage: "implementing", runState: "running", centralId: String(central._id), usage: { costUsd: 3, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 } })
    return { projectId: String(project._id), todoId: String(todo._id) }
}

beforeEach(() => {
    vi.clearAllMocks()
    for (const model of Object.values(mocks.models)) model.docs.length = 0
    mocks.concludedColumnKeys.mockResolvedValue(["done"])
    mocks.finance.mockResolvedValue({
        from: RANGE.from,
        to: RANGE.to,
        groups: [{ clientId: "c1", clientName: "Acme", taskCount: 1, totalHours: 2, totalClientHours: 4, totalBillingBrl: 400, tasks: [{ id: "x", code: "POR-2", title: "Bug", project: null, hours: 2, clientHours: 4, billingBrl: 400, completedAt: "2026-10-10T12:00:00.000Z" }] }],
        totals: { taskCount: 1, totalHours: 2, totalClientHours: 4, totalBillingBrl: 400 },
    })
})

describe("buildDashboard", () => {
    it("monta KPIs e séries a partir de tarefas, auditoria, horas e mesas", async () => {
        const { projectId } = await seed()

        const result = await buildDashboard(RANGE)

        expect(result.kpis).toMatchObject({
            tasksActive: 2,
            tasksInProgress: 1,
            tasksCompleted: 1,
            billingBrl: 400,
            clientHours: 4,
            loggedMinutes: 45,
            costUsd: 2,
            activeWorkbenches: 1,
            runningWorkbenches: 1,
        })
        expect(result.tasksByColumn).toEqual([
            { key: "todo", label: "A Fazer", color: "zinc", count: 1 },
            { key: "done", label: "Concluído", color: "emerald", count: 1 },
        ])
        expect(result.tasksTimeline.find((point) => point.bucket === "2026-10-05")).toMatchObject({ created: 1 })
        expect(result.tasksTimeline.find((point) => point.bucket === "2026-10-10")).toMatchObject({ completed: 1 })
        expect(result.financeByClient).toEqual([{ clientId: "c1", clientName: "Acme", billingBrl: 400, clientHours: 4, taskCount: 1 }])
        expect(result.financeTimeline).toEqual([{ bucket: "2026-10", billingBrl: 400 }])
        expect(result.timeByDay.find((point) => point.bucket === "2026-10-05")).toMatchObject({ minutes: 45, costUsd: 2 })
        expect(result.costByProject).toEqual([{ projectId, name: "Portal", sigla: "POR", minutes: 45, costUsd: 2 }])
        expect(result.workbenchFunnel.find((step) => step.step === "implement")).toMatchObject({ count: 1 })
        expect(result.range).toEqual({ from: RANGE.from, to: RANGE.to })
    })

    it("base vazia devolve zeros e séries com buckets do período", async () => {
        mocks.finance.mockResolvedValue(emptyFinance)

        const result = await buildDashboard(RANGE)

        expect(result.kpis).toMatchObject({ tasksActive: 0, tasksInProgress: 0, tasksCompleted: 0, loggedMinutes: 0, costUsd: 0, activeWorkbenches: 0 })
        expect(result.tasksByColumn).toEqual([])
        expect(result.tasksTimeline).toHaveLength(31)
        expect(result.tasksTimeline.every((point) => point.created === 0 && point.completed === 0)).toBe(true)
    })

    it("sem parâmetros assume os últimos 30 dias e o fuso UTC", async () => {
        const result = await buildDashboard({})
        expect(result.range.from).not.toBeNull()
        expect(result.range.to).not.toBeNull()
    })

    it("período invertido é rejeitado", async () => {
        await expect(buildDashboard({ from: "2026-10-31T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" })).rejects.toThrow("Período inválido")
    })
})
