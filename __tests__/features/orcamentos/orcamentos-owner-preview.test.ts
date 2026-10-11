import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    recordAudit: vi.fn(),
    createTaskWithIssue: vi.fn(),
    listGithubRepos: vi.fn(),
    clients: null as unknown,
    drafts: null as unknown,
    projects: null as unknown,
}))

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(),
    recordAudit: mocks.recordAudit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", APROVAR: "APROVAR" },
}))
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
vi.mock("@/features/github/server/task-issue", () => ({ createTaskWithIssue: mocks.createTaskWithIssue }))
vi.mock("@/features/github/server/lookups", () => ({ listGithubRepos: mocks.listGithubRepos }))
vi.mock("@/features/orcamentos/server/tag-views", () => ({ resolveTagViews: async (ids: string[]) => ids.map((id) => ({ id, label: id })) }))

import { OWNER_SCOPE, clientScope, getDraft, recomputeDraftEstimate, saveDraftEstimate, saveDraftPreview, setDraftEstimateClient } from "@/features/orcamentos/server/drafts"
import { approveOwnerDraft, createOwnerDraft, getOwnerDraftDoc, recomputeOwnerEstimate, setOwnerCorrection } from "@/features/orcamentos/server/owner"
import type { ClienteOrcamentoDoc } from "@/features/orcamentos/server/token"
import type { MemoryModel } from "../../helpers/memory-model"

const clients = () => mocks.clients as MemoryModel
const drafts = () => mocks.drafts as MemoryModel
const projects = () => mocks.projects as MemoryModel

const preview = { title: "Corrigir X", taskType: "bugfix" as const, priority: "high" as const, technicalSpec: "## Passos", summary: "Corrige X" }

let projectId: string
let client: ClienteOrcamentoDoc

beforeEach(async () => {
    vi.clearAllMocks()
    mocks.listGithubRepos.mockResolvedValue([])
    projects().docs.length = 0
    clients().docs.length = 0
    drafts().docs.length = 0
    const project = await projects().create({ repo: "acme/app", repoUrl: "https://github.com/acme/app", name: "acme/app", sigla: "APP", entryColumnKey: "todo", enabled: true, taskSeq: 0 })
    projectId = String(project._id)
    client = (await clients().create({ name: "Acme", tokenHash: "h", tokenPrefix: "cli_x", projectIds: [projectId], hourlyRate: 40, profitFactor: 10, active: true })) as unknown as ClienteOrcamentoDoc
})

describe("prévia do dono (servidor)", () => {
    it("abre um rascunho sem cliente e recusa projeto inexistente", async () => {
        const draft = await createOwnerDraft({ projectId, description: "Ajustar o rodapé" })
        expect(draft.status).toBe("draft")
        expect(draft.estimateClientId).toBeNull()
        expect(draft.estimateClientName).toBeNull()
        expect(drafts().docs[0].clientId).toBeNull()
        await expect(createOwnerDraft({ projectId: "aaaaaaaaaaaaaaaaaaaaaaaa", description: "x" })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" })
    })

    it("isola o escopo: o rascunho do dono não é lido no escopo do cliente (e vice-versa)", async () => {
        const ownerDraft = await createOwnerDraft({ projectId, description: "Dono" })
        await expect(getDraft(clientScope(client), ownerDraft.id)).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" })
        const clientDraft = await drafts().create({ clientId: String(client._id), projectId, description: "Cliente", status: "draft" })
        await expect(getDraft(OWNER_SCOPE, String(clientDraft._id))).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" })
    })

    it("a limpeza por cliente não alcança o rascunho do dono (clientId null)", async () => {
        const ownerDraft = await createOwnerDraft({ projectId, description: "Dono" })
        await drafts().deleteMany({ clientId: String(client._id) })
        expect(drafts().docs.some((doc) => String(doc._id) === ownerDraft.id)).toBe(true)
    })

    it("estimar sem cliente mostra só as horas reais (custo nulo)", async () => {
        const draft = await createOwnerDraft({ projectId, description: "x" })
        await saveDraftPreview(OWNER_SCOPE, draft.id, preview)
        const estimate = await saveDraftEstimate(OWNER_SCOPE, draft.id, 2, "gemini/pro")
        expect(estimate).toEqual({ hours: 2, clientHours: null, billingBrl: null })
    })

    it("escolher/trocar/limpar o cliente recalcula só o custo das horas já estimadas", async () => {
        const draft = await createOwnerDraft({ projectId, description: "x" })
        await saveDraftPreview(OWNER_SCOPE, draft.id, preview)
        await saveDraftEstimate(OWNER_SCOPE, draft.id, 2, "gemini/pro")

        await setDraftEstimateClient(OWNER_SCOPE, draft.id, String(client._id))
        expect(await recomputeDraftEstimate(OWNER_SCOPE, draft.id)).toEqual({ hours: 2, clientHours: 20, billingBrl: 800 })

        await setDraftEstimateClient(OWNER_SCOPE, draft.id, null)
        expect(await recomputeDraftEstimate(OWNER_SCOPE, draft.id)).toEqual({ hours: 2, clientHours: null, billingBrl: null })
    })

    it("reestimar sem IA reusa as horas já estimadas", async () => {
        const draft = await createOwnerDraft({ projectId, description: "x" })
        await saveDraftPreview(OWNER_SCOPE, draft.id, preview)
        await saveDraftEstimate(OWNER_SCOPE, draft.id, 2, "gemini/pro")
        await setDraftEstimateClient(OWNER_SCOPE, draft.id, String(client._id))

        const { estimate } = await recomputeOwnerEstimate(await getOwnerDraftDoc(draft.id))
        expect(estimate).toEqual({ hours: 2, clientHours: 20, billingBrl: 800 })
    })

    it("valida o cliente escolhido: inexistente, inativo e sem o repositório", async () => {
        const draft = await createOwnerDraft({ projectId, description: "x" })
        await expect(setDraftEstimateClient(OWNER_SCOPE, draft.id, "aaaaaaaaaaaaaaaaaaaaaaaa")).rejects.toMatchObject({ code: "CLIENT_NOT_FOUND" })
        const inactive = await clients().create({ name: "Inativo", active: false, projectIds: [projectId] })
        await expect(setDraftEstimateClient(OWNER_SCOPE, draft.id, String(inactive._id))).rejects.toMatchObject({ code: "CLIENT_INACTIVE" })
        const other = await clients().create({ name: "Outro", active: true, projectIds: [] })
        await expect(setDraftEstimateClient(OWNER_SCOPE, draft.id, String(other._id))).rejects.toMatchObject({ code: "CLIENT_NOT_FOR_PROJECT" })
    })

    it("aprovar sem cliente cria a tarefa sem clientId/estimate e com origem opex", async () => {
        const draft = await createOwnerDraft({ projectId, description: "Ajustar o rodapé" })
        await saveDraftPreview(OWNER_SCOPE, draft.id, preview)
        mocks.createTaskWithIssue.mockResolvedValue({ id: "t1", code: "APP-1" })

        const task = await approveOwnerDraft(draft.id, "local")
        expect(task).toMatchObject({ id: "t1", code: "APP-1" })
        expect(mocks.createTaskWithIssue).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Corrigir X", projectId, columnId: "todo", priority: "high" }),
            "local",
            expect.objectContaining({ origin: "opex", tags: [] }),
        )
        const options = mocks.createTaskWithIssue.mock.calls[0][2] as { clientId?: unknown; estimate?: unknown }
        expect(options.clientId).toBeUndefined()
        expect(options.estimate).toBeUndefined()
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "RascunhoOrcamento", acao: "APROVAR" }))
        const after = await getDraft(OWNER_SCOPE, draft.id)
        expect(after.status).toBe("approved")
        expect(after.taskId).toBe("t1")
    })

    it("aprovar com cliente grava o cliente e o snapshot do orçamento", async () => {
        const draft = await createOwnerDraft({ projectId, description: "Ajustar o rodapé" })
        await saveDraftPreview(OWNER_SCOPE, draft.id, preview)
        await saveDraftEstimate(OWNER_SCOPE, draft.id, 2, "gemini/pro")
        await setDraftEstimateClient(OWNER_SCOPE, draft.id, String(client._id))
        mocks.createTaskWithIssue.mockResolvedValue({ id: "t2", code: "APP-2" })

        await approveOwnerDraft(draft.id, "local")
        expect(mocks.createTaskWithIssue).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Corrigir X" }),
            "local",
            expect.objectContaining({
                origin: "opex",
                clientId: String(client._id),
                estimate: expect.objectContaining({ hours: 2, clientHours: 20, billingBrl: 800, factor: 10, hourlyRate: 40, model: "gemini/pro" }),
            }),
        )
    })

    it("a prioridade escolhida sobrepõe a sugerida pela IA", async () => {
        const draft = await createOwnerDraft({ projectId, description: "Ajustar o rodapé" })
        await saveDraftPreview(OWNER_SCOPE, draft.id, preview)
        mocks.createTaskWithIssue.mockResolvedValue({ id: "t3", code: "APP-3" })
        await approveOwnerDraft(draft.id, "local", "low")
        expect(mocks.createTaskWithIssue).toHaveBeenCalledWith(expect.objectContaining({ priority: "low" }), "local", expect.anything())
    })

    it("recusa aprovar sem prévia", async () => {
        const draft = await createOwnerDraft({ projectId, description: "x" })
        await expect(approveOwnerDraft(draft.id, "local")).rejects.toMatchObject({ code: "DRAFT_WITHOUT_PREVIEW" })
    })

    it("recusa corrigir, escolher cliente e aprovar de novo um rascunho já aprovado", async () => {
        const draft = await createOwnerDraft({ projectId, description: "x" })
        await saveDraftPreview(OWNER_SCOPE, draft.id, preview)
        mocks.createTaskWithIssue.mockResolvedValue({ id: "t4", code: "APP-4" })
        await approveOwnerDraft(draft.id, "local")

        await expect(setOwnerCorrection(draft.id, "mude")).rejects.toMatchObject({ code: "DRAFT_APPROVED" })
        await expect(setDraftEstimateClient(OWNER_SCOPE, draft.id, null)).rejects.toMatchObject({ code: "DRAFT_APPROVED" })
        await expect(approveOwnerDraft(draft.id, "local")).rejects.toMatchObject({ code: "DRAFT_APPROVED" })
    })

    it("corrigir e regenerar a prévia zera a estimativa anterior", async () => {
        const draft = await createOwnerDraft({ projectId, description: "x" })
        await saveDraftPreview(OWNER_SCOPE, draft.id, preview)
        await saveDraftEstimate(OWNER_SCOPE, draft.id, 2, "gemini/pro")

        const corrected = await setOwnerCorrection(draft.id, "Mude o título")
        expect(corrected.correction).toBe("Mude o título")
        const again = await saveDraftPreview(OWNER_SCOPE, draft.id, { ...preview, title: "Outro título" })
        expect(again.estimate).toBeNull()
    })
})
