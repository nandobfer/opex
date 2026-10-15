import { beforeEach, describe, expect, it, vi } from "vitest"
import { DomainError } from "@/lib/api/route"
import type { MemoryModel } from "../../helpers/memory-model"

/**
 * Serviço de Serviços (lançamento manual de faturamento): código, recálculo dos três valores com o
 * snapshot do cliente, vínculo opcional de repositório/tarefa, auditoria e soft delete/restauração.
 */

const mocks = vi.hoisted(() => ({
    nextProjectCode: vi.fn(),
    publishToChannels: vi.fn(),
    recordAudit: vi.fn(),
    models: {} as Record<string, MemoryModel>,
}))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/after-response", () => ({ runAfterResponse: vi.fn() }))
vi.mock("@/lib/pusher/channels", () => ({ appChannel: () => "private-app", clientChannel: (id: string) => `private-client-${id}`, publishToChannels: mocks.publishToChannels }))
vi.mock("@/lib/logger", () => ({ loggerFor: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }))
vi.mock("@/features/tasks/server/service", () => ({ nextProjectCode: mocks.nextProjectCode }))
vi.mock("@/features/orcamentos/server/tag-views", () => ({ resolveTagViews: async () => [] }))
vi.mock("@/features/tasks/attachments/server/service", () => ({
    countServiceAttachments: async () => 0,
    linkAttachmentsToService: vi.fn(),
    syncServiceAttachmentsClient: vi.fn(),
}))
vi.mock("@/features/tasks/attachments/server/actor", () => ({ ownerAttachmentActor: () => ({ kind: "owner", userId: "local", name: "Dono", clientId: null }) }))
vi.mock("@/lib/db/models/Counter", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.counter = memoryModel()
    return { Counter: mocks.models.counter }
})
vi.mock("@/lib/db/models/FinanceService", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.service = memoryModel()
    return { FinanceService: mocks.models.service }
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
vi.mock("@/lib/db/models/DevTask", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.models.task = memoryModel()
    return { DevTask: mocks.models.task }
})

import { createService, setServiceArchived, updateService } from "@/features/services/server/service"
import type { ServiceWriteInput } from "@/features/services/schemas"

const baseInput = (overrides: Partial<ServiceWriteInput> = {}): ServiceWriteInput => ({
    clientId: "a".repeat(24),
    description: "Consultoria de arquitetura",
    serviceDate: "2026-10-08",
    origin: "hours",
    hours: 2,
    clientHours: 0,
    billingBrl: 0,
    ...overrides,
})

async function seedClient(overrides: Record<string, unknown> = {}) {
    return mocks.models.client!.create({ name: "Acme", profitFactor: 2, hourlyRate: 100, ...overrides })
}

beforeEach(() => {
    vi.clearAllMocks()
    for (const model of Object.values(mocks.models)) model.docs.length = 0
    mocks.nextProjectCode.mockResolvedValue("POR-7")
})

describe("createService", () => {
    it("cria com código SRV e recalcula os valores com o snapshot do cliente", async () => {
        const client = await seedClient()

        const service = await createService(baseInput({ clientId: String(client._id) }), "local")

        expect(service).toMatchObject({ code: "SRV-1", clientId: String(client._id), hours: 2, clientHours: 4, billingBrl: 400, factor: 2, hourlyRate: 100, aiStatus: "pending" })
        expect(service.serviceDate).toBe("2026-10-08T00:00:00.000Z")
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "Servico", acao: "CRIAR" }))
        expect(mocks.publishToChannels).toHaveBeenCalled()
    })

    it("usa a sequência das tarefas quando o repositório tem sigla", async () => {
        const client = await seedClient()
        const project = await mocks.models.project!.create({ name: "Portal", repo: "o/portal", sigla: "POR", taskSeq: 6 })

        const service = await createService(baseInput({ clientId: String(client._id), projectId: String(project._id) }), "local")

        expect(service.code).toBe("POR-7")
        expect(mocks.nextProjectCode).toHaveBeenCalled()
    })

    it("cai no SRV quando o repositório não tem sigla", async () => {
        const client = await seedClient()
        const project = await mocks.models.project!.create({ name: "Sem sigla", repo: "o/x" })

        const service = await createService(baseInput({ clientId: String(client._id), projectId: String(project._id) }), "local")

        expect(service.code).toBe("SRV-1")
        expect(mocks.nextProjectCode).not.toHaveBeenCalled()
    })

    it("recalcula a partir do faturamento, sem estourar em custo/hora zero", async () => {
        const client = await seedClient({ hourlyRate: 0 })

        const service = await createService(baseInput({ clientId: String(client._id), origin: "billingBrl", hours: 5, clientHours: 9, billingBrl: 250 }), "local")

        expect(service).toMatchObject({ billingBrl: 250, clientHours: 0, hours: 0 })
    })

    it("recusa cliente inexistente", async () => {
        await expect(createService(baseInput({ clientId: "b".repeat(24) }), "local")).rejects.toBeInstanceOf(DomainError)
    })
})

describe("updateService", () => {
    async function seedService(clientId: string, overrides: Record<string, unknown> = {}) {
        return mocks.models.service!.create({
            code: "SRV-1",
            clientId,
            projectId: null,
            taskId: null,
            description: "Descrição antiga",
            title: null,
            summary: null,
            tags: [],
            serviceDate: new Date("2026-10-01T00:00:00.000Z"),
            hours: 1,
            clientHours: 2,
            billingBrl: 200,
            factor: 2,
            hourlyRate: 100,
            aiStatus: "done",
            aiError: null,
            archived: false,
            ...overrides,
        })
    }

    it("recalcula com o fator/custo do novo cliente e atualiza o snapshot", async () => {
        const first = await seedClient({ name: "Antigo", profitFactor: 2, hourlyRate: 100 })
        const next = await seedClient({ name: "Novo", profitFactor: 3, hourlyRate: 50 })
        const service = await seedService(String(first._id))

        const updated = await updateService(String(service._id), baseInput({ clientId: String(next._id), hours: 2 }), "local")

        expect(updated).toMatchObject({ clientId: String(next._id), hours: 2, clientHours: 6, billingBrl: 300, factor: 3, hourlyRate: 50 })
    })

    it("marca a IA como pendente quando a descrição muda", async () => {
        const client = await seedClient()
        const service = await seedService(String(client._id))

        const updated = await updateService(String(service._id), baseInput({ clientId: String(client._id), description: "Descrição nova" }), "local")

        expect(updated.description).toBe("Descrição nova")
        expect(updated.aiStatus).toBe("pending")
    })
})

describe("setServiceArchived", () => {
    it("arquiva e restaura (soft delete)", async () => {
        const client = await seedClient()
        const service = await mocks.models.service!.create({ code: "SRV-1", clientId: String(client._id), description: "x", tags: [], serviceDate: new Date("2026-10-01T00:00:00.000Z"), hours: 1, clientHours: 2, billingBrl: 200, factor: 2, hourlyRate: 100, aiStatus: "done", archived: false })

        expect((await setServiceArchived(String(service._id), true, "local")).archived).toBe(true)
        expect((await setServiceArchived(String(service._id), false, "local")).archived).toBe(false)
    })
})
