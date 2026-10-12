import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    recordAudit: vi.fn(),
    publish: vi.fn(),
    logUsage: vi.fn(),
    requireSettings: vi.fn(),
    estimateHours: vi.fn(),
    resolveClient: vi.fn(),
    devTask: null as unknown,
    project: null as unknown,
}))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/api/route", () => ({
    DomainError: class DomainError extends Error {
        status: number
        code?: string
        constructor(status: number, message: string, code?: string) {
            super(message)
            this.status = status
            this.code = code
        }
    },
}))
vi.mock("@/lib/pusher/channels", () => ({ appChannel: () => "private-app", publishToChannels: mocks.publish }))
vi.mock("@/lib/db/models/DevTask", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.devTask = memoryModel()
    return { DevTask: mocks.devTask }
})
vi.mock("@/lib/db/models/Project", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.project = memoryModel()
    return { Project: mocks.project }
})
vi.mock("@/features/orcamentos/server/estimate-hours", () => ({
    requireEstimateSettings: mocks.requireSettings,
    logUsage: mocks.logUsage,
    estimateHours: mocks.estimateHours,
}))
vi.mock("@/features/tasks/server/service", () => ({
    TASK_AUDIT_ENTITY: "Tarefa",
    publishTasksUpdated: mocks.publish,
    resolveTaskClient: mocks.resolveClient,
    toEstimateDto: (estimate: Record<string, unknown>) => ({ ...estimate, generatedAt: estimate.generatedAt ? new Date(estimate.generatedAt as string).toISOString() : null }),
}))

import { prepareTaskEstimate, runTaskEstimate, type TaskEstimateEvent } from "@/features/tasks/server/estimate"
import type { MemoryModel } from "../../helpers/memory-model"

const tasks = () => mocks.devTask as MemoryModel
const projects = () => mocks.project as MemoryModel

const settings = { provider: "gemini", model: "gemini-3-flash" }

async function createTaskDoc(overrides: Record<string, unknown> = {}) {
    const project = await projects().create({ repo: "acme/app", name: "acme/app", sigla: "APP", entryColumnKey: "todo", taskSeq: 0 })
    const task = await tasks().create({
        code: "APP-1",
        projectId: String(project._id),
        columnId: "todo",
        order: 0,
        title: "Ajustar rodapé",
        description: "Corrigir o rodapé",
        technicalSpec: "## Passos",
        taskType: "bugfix",
        priority: "medium",
        archived: false,
        clientId: null,
        tags: ["api"],
        estimate: null,
        ...overrides,
    })
    return String(task._id)
}

async function collect(gen: AsyncGenerator<TaskEstimateEvent>): Promise<TaskEstimateEvent[]> {
    const events: TaskEstimateEvent[] = []
    for await (const event of gen) events.push(event)
    return events
}

beforeEach(() => {
    vi.clearAllMocks()
    tasks().docs.length = 0
    projects().docs.length = 0
    mocks.requireSettings.mockResolvedValue(settings)
    mocks.resolveClient.mockResolvedValue(null)
    mocks.logUsage.mockResolvedValue(undefined)
    mocks.estimateHours.mockImplementation(async function* () {
        yield { type: "start", provider: "gemini", model: "gemini-3-flash" }
        yield { type: "notice", message: "Buscando tarefas semelhantes…" }
        yield { type: "estimated", hours: 6, model: "gemini/gemini-3-flash", tags: ["api"], usage: null }
    })
})

describe("preparar a estimativa da tarefa", () => {
    it("monta a entrada a partir dos dados da própria tarefa (sem criar rascunho)", async () => {
        const id = await createTaskDoc()
        const prepared = await prepareTaskEstimate(id)
        expect(prepared.taskId).toBe(id)
        expect(prepared.core.subject).toBe(`task:${id}`)
        expect(prepared.core.preview).toMatchObject({ title: "Ajustar rodapé", taskType: "bugfix", tags: ["api"] })
        expect(prepared.core.input).toMatchObject({ projectName: "acme/app", description: "Corrigir o rodapé" })
        expect(tasks().docs[0].estimate).toBeNull()
    })

    it("valida o id e a existência da tarefa", async () => {
        await expect(prepareTaskEstimate("nope")).rejects.toMatchObject({ status: 404, code: "TASK_NOT_FOUND" })
        await expect(prepareTaskEstimate("a".repeat(24))).rejects.toMatchObject({ status: 404, code: "TASK_NOT_FOUND" })
    })

    it("propaga a indisponibilidade da feature (antes do stream)", async () => {
        const id = await createTaskDoc()
        mocks.requireSettings.mockRejectedValue(Object.assign(new Error("Feature desativada"), { status: 409, code: "AI_FEATURE_UNAVAILABLE" }))
        await expect(prepareTaskEstimate(id)).rejects.toMatchObject({ status: 409, code: "AI_FEATURE_UNAVAILABLE" })
    })
})

describe("gerar a estimativa da tarefa (streaming + gravação)", () => {
    it("sem cliente, grava o snapshot neutro (fator 1, sem faturamento) e publica", async () => {
        const id = await createTaskDoc()
        const prepared = await prepareTaskEstimate(id)
        const events = await collect(runTaskEstimate(prepared, "local"))

        const done = events.find((event) => event.type === "done")
        expect(done).toMatchObject({ type: "done", estimate: { hours: 6, clientHours: 6, billingBrl: 0, factor: 1, hourlyRate: 0, model: "gemini/gemini-3-flash" } })
        expect(events.some((event) => event.type === "notice")).toBe(true)
        expect(tasks().docs[0].estimate).toMatchObject({ hours: 6, factor: 1, hourlyRate: 0 })
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "Tarefa", acao: "ATUALIZAR", depois: expect.objectContaining({ estimativa: "gerada por IA" }) }))
        expect(mocks.publish).toHaveBeenCalledWith([id])
        expect(mocks.logUsage).toHaveBeenCalledWith("estimate-hours", settings, `task:${id}`, true, null, expect.any(Number), null)
    })

    it("com cliente, infla o snapshot com o fator e o custo/hora da tarefa", async () => {
        const id = await createTaskDoc({ clientId: "c1" })
        mocks.resolveClient.mockResolvedValue({ name: "Acme", profitFactor: 4, hourlyRate: 50 })
        const prepared = await prepareTaskEstimate(id)
        const events = await collect(runTaskEstimate(prepared, "local"))

        expect(events.find((event) => event.type === "done")).toMatchObject({ type: "done", estimate: { hours: 6, clientHours: 24, billingBrl: 1200, factor: 4, hourlyRate: 50 } })
    })

    it("não grava quando a tarefa muda durante a geração (edição concorrente)", async () => {
        const id = await createTaskDoc()
        const prepared = await prepareTaskEstimate(id)
        // Simula uma edição concorrente: o `updatedAt` muda depois do preparo.
        tasks().docs[0].updatedAt = new Date(Date.now() + 60_000)

        const events = await collect(runTaskEstimate(prepared, "local"))
        expect(events.find((event) => event.type === "error")).toMatchObject({ type: "error", message: "A tarefa mudou durante a estimativa. Tente novamente." })
        expect(tasks().docs[0].estimate).toBeNull()
        expect(mocks.publish).not.toHaveBeenCalled()
    })

    it("repassa o erro do núcleo sem gravar nada", async () => {
        const id = await createTaskDoc()
        mocks.estimateHours.mockImplementation(async function* () {
            yield { type: "start", provider: "gemini", model: "gemini-3-flash" }
            yield { type: "error", message: "falhou" }
        })
        const prepared = await prepareTaskEstimate(id)
        const events = await collect(runTaskEstimate(prepared, "local"))
        expect(events.find((event) => event.type === "error")).toMatchObject({ type: "error", message: "falhou" })
        expect(tasks().docs[0].estimate).toBeNull()
        expect(mocks.publish).not.toHaveBeenCalled()
    })
})
