import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    recordAudit: vi.fn(),
    publish: vi.fn(),
    createTaskWithIssue: vi.fn(),
    clients: null as unknown,
    drafts: null as unknown,
    projects: null as unknown,
}))

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(),
    recordAudit: mocks.recordAudit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", APROVAR: "APROVAR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish, appChannel: () => "private-app", publishToChannels: vi.fn() }))
vi.mock("@/lib/db/models/Orcamento", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.clients = memoryModel()
    mocks.drafts = memoryModel()
    return { OrcamentoClient: mocks.clients, OrcamentoDraft: mocks.drafts }
})
vi.mock("@/lib/db/models/Project", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.projects = memoryModel()
    return { Project: mocks.projects }
})
vi.mock("@/features/tasks/server/service", () => ({ listTasksForProjects: vi.fn(async () => ({ tasks: [], fetchedAt: "now" })) }))
vi.mock("@/features/tasks/server/columns", () => ({ getBoard: vi.fn(async () => ({ columns: [], layout: [] })) }))
vi.mock("@/features/github/server/task-issue", () => ({ createTaskWithIssue: mocks.createTaskWithIssue }))

import { approveDraft, createDraft, getDraft, saveDraftPreview, setDraftCorrection } from "@/features/orcamentos/server/portal"
import type { ClienteOrcamentoDoc } from "@/features/orcamentos/server/token"
import type { MemoryModel } from "../../helpers/memory-model"

const projects = () => mocks.projects as MemoryModel
const clients = () => mocks.clients as MemoryModel

let projectId: string
let client: ClienteOrcamentoDoc

const preview = { title: "Corrigir X", taskType: "bugfix" as const, priority: "high" as const, technicalSpec: "## Passos", summary: "Corrige X", estimatedHours: 2 }

beforeEach(async () => {
    vi.clearAllMocks()
    projects().docs.length = 0
    clients().docs.length = 0
    ;(mocks.drafts as MemoryModel).docs.length = 0
    const project = await projects().create({ repo: "acme/app", repoUrl: "https://github.com/acme/app", name: "acme/app", sigla: "APP", entryColumnKey: "todo", enabled: true, taskSeq: 0 })
    projectId = String(project._id)
    client = (await clients().create({ name: "Acme", tokenHash: "h", tokenPrefix: "cli_x", projectIds: [projectId], hourlyRate: 40, profitFactor: 10, active: true })) as unknown as ClienteOrcamentoDoc
})

describe("portal do cliente", () => {
    it("abre um rascunho para um repositório permitido e recusa os demais", async () => {
        const draft = await createDraft(client, { projectId, description: "Ajustar o rodapé" })
        expect(draft.status).toBe("draft")
        expect(draft.projectName).toBe("acme/app")
        await expect(createDraft(client, { projectId: "aaaaaaaaaaaaaaaaaaaaaaaa", description: "x" })).rejects.toMatchObject({ code: "PROJECT_NOT_ALLOWED" })
    })

    it("grava a prévia e calcula as horas do cliente com o fator (H × fator) e o faturamento", async () => {
        const draft = await createDraft(client, { projectId, description: "Ajustar o rodapé" })
        const saved = await saveDraftPreview(client, draft.id, preview, "gemini/pro")
        expect(saved.estimate).toEqual({ hours: 2, clientHours: 20, billingBrl: 800 })
    })

    it("registra a correção pedida pelo cliente", async () => {
        const draft = await createDraft(client, { projectId, description: "x" })
        const corrected = await setDraftCorrection(client, draft.id, "Mude o título")
        expect(corrected.correction).toBe("Mude o título")
    })

    it("ao aprovar, cria a tarefa na coluna de entrada com a estimativa e marca o rascunho", async () => {
        const draft = await createDraft(client, { projectId, description: "Ajustar o rodapé" })
        await saveDraftPreview(client, draft.id, preview, "gemini/pro")
        mocks.createTaskWithIssue.mockResolvedValue({ id: "t1", code: "APP-1" })

        const task = await approveDraft(client, draft.id, "local")
        expect(task).toMatchObject({ id: "t1", code: "APP-1" })
        expect(mocks.createTaskWithIssue).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Corrigir X", projectId, columnId: "todo", priority: "high" }),
            "local",
            expect.objectContaining({ origin: "client", estimate: expect.objectContaining({ hours: 2, clientHours: 20, billingBrl: 800, factor: 10, hourlyRate: 40, model: "gemini/pro" }) }),
        )
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "RascunhoOrcamento", acao: "APROVAR" }))
        const after = await getDraft(client, draft.id)
        expect(after.status).toBe("approved")
        expect(after.taskId).toBe("t1")
    })

    it("recusa aprovar sem prévia", async () => {
        const draft = await createDraft(client, { projectId, description: "x" })
        await expect(approveDraft(client, draft.id, "local")).rejects.toMatchObject({ code: "DRAFT_WITHOUT_PREVIEW" })
    })
})
