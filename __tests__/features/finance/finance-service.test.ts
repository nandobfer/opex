import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryModel } from "../../helpers/memory-model"

const mocks = vi.hoisted(() => ({
    concludedColumnKeys: vi.fn(),
    listServices: vi.fn(),
    models: {} as Record<string, MemoryModel>,
}))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/features/tasks/server/service", () => ({ concludedColumnKeys: mocks.concludedColumnKeys, TASK_AUDIT_ENTITY: "Tarefa" }))
vi.mock("@/features/services/server/service", () => ({ listServiceAggregates: mocks.listServices }))
vi.mock("@/lib/db/models/AuditLog", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.audit = memoryModel()
    return { AuditLog: mocks.models.audit }
})
vi.mock("@/lib/db/models/DevTask", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.devTask = memoryModel()
    return { DevTask: mocks.models.devTask }
})
vi.mock("@/lib/db/models/Orcamento", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.client = memoryModel()
    return { OrcamentoClient: mocks.models.client }
})
vi.mock("@/lib/db/models/Project", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.project = memoryModel()
    return { Project: mocks.models.project }
})
vi.mock("@/lib/db/models/TaskBoard", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.column = memoryModel()
    return { TaskBoardColumn: mocks.models.column }
})

import { listFinanceByClient } from "@/features/finance/server/service"

const RANGE = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T23:59:59.999Z" }
const estimate = () => ({ hours: 2, clientHours: 4, billingBrl: 400, factor: 2, hourlyRate: 100, model: null, generatedAt: new Date() })

async function seedDoneTask(overrides: Record<string, unknown> = {}) {
    const client = overrides.clientId !== undefined ? overrides.clientId : (await mocks.models.client.create({ name: "Acme" }))._id
    const project = await mocks.models.project.create({ name: "Portal", repo: "acme/portal", sigla: "AP" })
    const task = await mocks.models.devTask.create({
        code: "AP-1",
        title: "Login",
        projectId: String(project._id),
        columnId: "done",
        order: 0,
        priority: "high",
        archived: false,
        clientId: client,
        estimate: estimate(),
        ...overrides,
    })
    return { clientId: String(client), task }
}

beforeEach(() => {
    vi.clearAllMocks()
    for (const model of Object.values(mocks.models)) model.docs.length = 0
    mocks.concludedColumnKeys.mockResolvedValue(["done"])
    mocks.listServices.mockResolvedValue([])
})

describe("listFinanceByClient", () => {
    it("agrupa as tarefas concluídas por cliente e usa o snapshot do faturamento", async () => {
        const { clientId, task } = await seedDoneTask()
        await mocks.models.column.create({ key: "done", name: "Concluído" })
        await mocks.models.audit.create({ entidade: "Tarefa", entidadeId: String(task._id), acao: "MOVER", dadosAnteriores: { coluna: "Em Andamento" }, dadosNovos: { coluna: "Concluído" }, timestamp: new Date("2026-10-05T12:00:00.000Z") })

        const result = await listFinanceByClient(RANGE)

        expect(result.groups).toHaveLength(1)
        expect(result.groups[0]).toMatchObject({ clientId, clientName: "Acme", taskCount: 1, totalBillingBrl: 400, totalClientHours: 4 })
        expect(result.groups[0].tasks[0]).toMatchObject({ code: "AP-1", billingBrl: 400, hours: 2, clientHours: 4, project: { repo: "acme/portal" } })
        expect(result.totals.totalBillingBrl).toBe(400)
    })

    it("sem colunas de conclusão devolve vazio", async () => {
        mocks.concludedColumnKeys.mockResolvedValue([])
        const result = await listFinanceByClient(RANGE)
        expect(result.groups).toEqual([])
        expect(result.totals).toEqual({ taskCount: 0, serviceCount: 0, totalHours: 0, totalClientHours: 0, totalBillingBrl: 0 })
    })

    it("lista serviços mesmo sem colunas de conclusão nem tarefas", async () => {
        mocks.concludedColumnKeys.mockResolvedValue([])
        const client = await mocks.models.client.create({ name: "Acme" })
        mocks.listServices.mockResolvedValue([
            { id: "svc1", code: "SRV-1", title: "Serviço", summary: null, clientId: String(client._id), projectId: null, project: null, taskId: null, serviceDate: new Date("2026-10-10T00:00:00.000Z").getTime(), hours: 1, clientHours: 2, billingBrl: 200, archived: false },
        ])

        const result = await listFinanceByClient(RANGE)

        expect(result.groups).toHaveLength(1)
        expect(result.groups[0]).toMatchObject({ clientName: "Acme", taskCount: 0, serviceCount: 1, totalBillingBrl: 200 })
        expect(result.groups[0]!.tasks[0]).toMatchObject({ kind: "service", code: "SRV-1" })
        expect(result.totals.serviceCount).toBe(1)
    })

    it("filtra pela data de conclusão derivada da auditoria (fora do período é ignorada)", async () => {
        const { task } = await seedDoneTask()
        await mocks.models.column.create({ key: "done", name: "Concluído" })
        await mocks.models.audit.create({ entidade: "Tarefa", entidadeId: String(task._id), acao: "MOVER", dadosNovos: { coluna: "Concluído" }, timestamp: new Date("2026-09-15T12:00:00.000Z") })

        expect((await listFinanceByClient(RANGE)).groups).toEqual([])
    })

    it("tarefa concluída sem evento de auditoria é ignorada", async () => {
        await seedDoneTask()
        await mocks.models.column.create({ key: "done", name: "Concluído" })
        expect((await listFinanceByClient(RANGE)).groups).toEqual([])
    })

    it("exclui tarefas arquivadas e sem cliente", async () => {
        const { task: archived } = await seedDoneTask({ archived: true })
        const { task: noClient } = await seedDoneTask({ clientId: null })
        await mocks.models.column.create({ key: "done", name: "Concluído" })
        for (const task of [archived, noClient]) {
            await mocks.models.audit.create({ entidade: "Tarefa", entidadeId: String(task._id), acao: "MOVER", dadosNovos: { coluna: "Concluído" }, timestamp: new Date("2026-10-05T12:00:00.000Z") })
        }
        expect((await listFinanceByClient(RANGE)).groups).toEqual([])
    })

    it("cliente sem registro cai em 'Cliente removido'", async () => {
        const { task } = await seedDoneTask({ clientId: "a".repeat(24) })
        await mocks.models.column.create({ key: "done", name: "Concluído" })
        await mocks.models.audit.create({ entidade: "Tarefa", entidadeId: String(task._id), acao: "ATUALIZAR", dadosNovos: { coluna: "done" }, timestamp: new Date("2026-10-05T12:00:00.000Z") })

        const result = await listFinanceByClient(RANGE)
        expect(result.groups).toHaveLength(1)
        expect(result.groups[0]).toMatchObject({ clientId: null, clientName: "Cliente removido", taskCount: 1 })
    })
})

describe("listFinanceByClient — filtros de cliente e repositório", () => {
    async function seedCompleted(overrides: Record<string, unknown> = {}) {
        const seeded = await seedDoneTask(overrides)
        await mocks.models.audit.create({ entidade: "Tarefa", entidadeId: String(seeded.task._id), acao: "MOVER", dadosNovos: { coluna: "Concluído" }, timestamp: new Date("2026-10-05T12:00:00.000Z") })
        return seeded
    }

    it("filtra pelos clientes selecionados e mantém os totais coerentes", async () => {
        const a = await seedCompleted({ code: "AP-1" })
        await seedCompleted({ code: "AP-2" })
        await mocks.models.column.create({ key: "done", name: "Concluído" })

        const result = await listFinanceByClient({ ...RANGE, clientIds: [a.clientId] })

        expect(result.groups).toHaveLength(1)
        expect(result.groups[0].clientId).toBe(a.clientId)
        expect(result.totals.taskCount).toBe(1)
        expect(result.totals.totalBillingBrl).toBe(400)
    })

    it("filtra pelos repositórios selecionados", async () => {
        await seedCompleted({ code: "AP-1" })
        const b = await seedCompleted({ code: "AP-2" })
        await mocks.models.column.create({ key: "done", name: "Concluído" })

        const result = await listFinanceByClient({ ...RANGE, projectIds: [String(b.task.projectId)] })

        expect(result.totals.taskCount).toBe(1)
        expect(result.groups[0].tasks[0].code).toBe("AP-2")
    })

    it("combina cliente e repositório (E): sem interseção devolve vazio", async () => {
        const a = await seedCompleted({ code: "AP-1" })
        const b = await seedCompleted({ code: "AP-2" })
        await mocks.models.column.create({ key: "done", name: "Concluído" })

        expect((await listFinanceByClient({ ...RANGE, clientIds: [a.clientId], projectIds: [String(b.task.projectId)] })).groups).toEqual([])
    })

    it("seleção sem tarefas correspondentes devolve vazio", async () => {
        await seedCompleted()
        await mocks.models.column.create({ key: "done", name: "Concluído" })

        expect((await listFinanceByClient({ ...RANGE, clientIds: ["a".repeat(24)] })).groups).toEqual([])
    })
})
