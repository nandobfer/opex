import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    recordAudit: vi.fn(),
    publish: vi.fn(),
    createTaskWithIssue: vi.fn(),
    listGithubRepos: vi.fn(),
    listTasksForClient: vi.fn(async () => ({ tasks: [], fetchedAt: "now" })),
    getTask: vi.fn(),
    addComment: vi.fn(),
    clients: null as unknown,
    drafts: null as unknown,
    projects: null as unknown,
    devTasks: null as unknown,
    comments: null as unknown,
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
vi.mock("@/lib/db/models/DevTask", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.devTasks = memoryModel()
    mocks.comments = memoryModel()
    return { DevTask: mocks.devTasks, TaskComment: mocks.comments }
})
vi.mock("@/features/tasks/server/service", () => ({
    listTasksForClient: mocks.listTasksForClient,
    getTask: mocks.getTask,
    addComment: mocks.addComment,
}))
vi.mock("@/features/tasks/server/columns", () => ({ getBoard: vi.fn(async () => ({ columns: [], layout: [] })) }))
vi.mock("@/features/github/server/task-issue", () => ({ createTaskWithIssue: mocks.createTaskWithIssue }))
vi.mock("@/features/github/server/lookups", () => ({ listGithubRepos: mocks.listGithubRepos }))

import { addClientComment, approveDraft, createDraft, getClientOptions, getClientTask, getDraft, listClientTasks, saveDraftEstimate, saveDraftPreview, setDraftCorrection } from "@/features/orcamentos/server/portal"
import type { ClienteOrcamentoDoc } from "@/features/orcamentos/server/token"
import type { MemoryModel } from "../../helpers/memory-model"

const projects = () => mocks.projects as MemoryModel
const clients = () => mocks.clients as MemoryModel

let projectId: string
let client: ClienteOrcamentoDoc

const preview = { title: "Corrigir X", taskType: "bugfix" as const, priority: "high" as const, technicalSpec: "## Passos", summary: "Corrige X" }

beforeEach(async () => {
    vi.clearAllMocks()
    mocks.listGithubRepos.mockResolvedValue([])
    projects().docs.length = 0
    clients().docs.length = 0
    ;(mocks.drafts as MemoryModel).docs.length = 0
    ;(mocks.devTasks as MemoryModel).docs.length = 0
    ;(mocks.comments as MemoryModel).docs.length = 0
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

    it("enriquece as opções do portal com os dados do GitHub (avatar, descrição e privacidade)", async () => {
        mocks.listGithubRepos.mockResolvedValue([{ fullName: "acme/app", htmlUrl: "https://github.com/acme/app", description: "App do Acme", private: true, ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1" }])
        const options = await getClientOptions(client)
        expect(options.projects).toHaveLength(1)
        expect(options.projects[0]).toMatchObject({ repo: "acme/app", ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1", description: "App do Acme", private: true })
    })

    it("enriquece o rascunho com o repositório do GitHub", async () => {
        mocks.listGithubRepos.mockResolvedValue([{ fullName: "acme/app", htmlUrl: "https://github.com/acme/app", description: "App do Acme", private: false, ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1" }])
        const draft = await createDraft(client, { projectId, description: "Ajustar o rodapé" })
        expect(draft.projectRepo).toMatchObject({ repo: "acme/app", ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1", description: "App do Acme", private: false })
    })

    it("mantém o portal funcionando quando o GitHub falha (rótulo sem avatar)", async () => {
        mocks.listGithubRepos.mockRejectedValue(new Error("sem token do GitHub"))
        const options = await getClientOptions(client)
        expect(options.projects[0]).toMatchObject({ repo: "acme/app", ownerAvatarUrl: null, description: null, private: false })
    })

    it("grava a prévia (sem estimativa) e, ao estimar, calcula H × fator e o faturamento", async () => {
        const draft = await createDraft(client, { projectId, description: "Ajustar o rodapé" })
        const saved = await saveDraftPreview(client, draft.id, preview, "gemini/pro")
        expect(saved.preview).toMatchObject({ title: "Corrigir X" })
        expect(saved.estimate).toBeNull()

        const estimate = await saveDraftEstimate(client, draft.id, 2)
        expect(estimate).toEqual({ hours: 2, clientHours: 20, billingBrl: 800 })
        expect((await getDraft(client, draft.id)).estimate).toEqual({ hours: 2, clientHours: 20, billingBrl: 800 })
    })

    it("regravar a prévia (correção) zera a estimativa anterior", async () => {
        const draft = await createDraft(client, { projectId, description: "Ajustar o rodapé" })
        await saveDraftPreview(client, draft.id, preview, "gemini/pro")
        await saveDraftEstimate(client, draft.id, 2)
        const again = await saveDraftPreview(client, draft.id, { ...preview, title: "Outro título" }, "gemini/pro")
        expect(again.estimate).toBeNull()
    })

    it("registra a correção pedida pelo cliente", async () => {
        const draft = await createDraft(client, { projectId, description: "x" })
        const corrected = await setDraftCorrection(client, draft.id, "Mude o título")
        expect(corrected.correction).toBe("Mude o título")
    })

    it("ao aprovar, cria a tarefa na coluna de entrada com a estimativa e marca o rascunho", async () => {
        const draft = await createDraft(client, { projectId, description: "Ajustar o rodapé" })
        await saveDraftPreview(client, draft.id, preview, "gemini/pro")
        await saveDraftEstimate(client, draft.id, 2)
        mocks.createTaskWithIssue.mockResolvedValue({ id: "t1", code: "APP-1" })

        const task = await approveDraft(client, draft.id, "local")
        expect(task).toMatchObject({ id: "t1", code: "APP-1" })
        expect(mocks.createTaskWithIssue).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Corrigir X", projectId, columnId: "todo", priority: "high" }),
            "local",
            expect.objectContaining({ origin: "client", clientId: String(client._id), estimate: expect.objectContaining({ hours: 2, clientHours: 20, billingBrl: 800, factor: 10, hourlyRate: 40, model: "gemini/pro" }) }),
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

    it("permite aprovar sem estimativa (a tarefa nasce sem orçamento)", async () => {
        const draft = await createDraft(client, { projectId, description: "x" })
        await saveDraftPreview(client, draft.id, preview, "gemini/pro")
        mocks.createTaskWithIssue.mockResolvedValue({ id: "t2", code: "APP-2" })
        await approveDraft(client, draft.id, "local")
        const options = mocks.createTaskWithIssue.mock.calls[0][2] as { origin: string; estimate?: unknown }
        expect(options.origin).toBe("client")
        expect(options.estimate).toBeUndefined()
    })
})

const taskDto = {
    id: "t1",
    code: "APP-1",
    columnId: "todo",
    order: 0,
    title: "Ajustar o rodapé",
    summary: "Corrige o rodapé",
    taskType: "bugfix" as const,
    priority: "high" as const,
    archived: false,
    project: { id: "p", name: "acme/app", repo: "acme/app", sigla: "APP" },
    estimate: { hours: 2, clientHours: 20, billingBrl: 800, factor: 10, hourlyRate: 40, model: "gemini/pro", generatedAt: null },
    createdAt: null,
    updatedAt: null,
}

const taskDetail = {
    ...taskDto,
    description: "Descrição do cliente",
    technicalSpec: "## Passos",
    comments: [{ id: "c1", content: "Oi", authorType: "client" as const, authorName: "Acme", createdAt: null }],
    history: [{ id: "h1", action: "criada", description: "Tarefa criada", createdAt: null }],
    timeLogs: [{ id: "l1", startTime: null, endTime: null, duration: 60, description: null, active: false, agent: null, model: null, costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }],
    totalTimeLogged: 60,
    estimateClientName: "Acme",
}

describe("lista e detalhe do portal (visão do cliente)", () => {
    it("lista só as tarefas do cliente (por clientId) e sem as horas reais", async () => {
        mocks.listTasksForClient.mockResolvedValue({ tasks: [taskDto], fetchedAt: "now" })
        const list = await listClientTasks(client, false)
        expect(mocks.listTasksForClient).toHaveBeenCalledWith(String(client._id), false)
        expect(list.tasks[0]).toMatchObject({ id: "t1", code: "APP-1" })
        expect(list.tasks[0].estimate).toEqual({ clientHours: 20, billingBrl: 800 })
        expect(list.tasks[0].estimate).not.toHaveProperty("hours")
    })

    it("detalhe esconde histórico, horas apontadas e os dados internos da estimativa", async () => {
        const doc = await (mocks.devTasks as MemoryModel).create({ clientId: String(client._id) })
        mocks.getTask.mockResolvedValue(taskDetail)
        const detail = await getClientTask(client, String(doc._id))
        expect(detail.description).toBe("Descrição do cliente")
        expect(detail.technicalSpec).toBe("## Passos")
        expect(detail.estimate).toEqual({ clientHours: 20, billingBrl: 800 })
        expect(detail).not.toHaveProperty("history")
        expect(detail).not.toHaveProperty("timeLogs")
        expect(detail).not.toHaveProperty("totalTimeLogged")
        expect(detail).not.toHaveProperty("estimateClientName")
        expect(detail.comments[0]).toMatchObject({ authorName: "Acme" })
    })

    it("recusa (404) a tarefa de outro cliente", async () => {
        const other = await (mocks.devTasks as MemoryModel).create({ clientId: "outro" })
        await expect(getClientTask(client, String(other._id))).rejects.toMatchObject({ code: "TASK_NOT_FOUND" })
    })

    it("comenta marcando a origem como o nome do cliente", async () => {
        const doc = await (mocks.devTasks as MemoryModel).create({ clientId: String(client._id) })
        await addClientComment(client, String(doc._id), "Olá")
        expect(mocks.addComment).toHaveBeenCalledWith(String(doc._id), "Olá", { id: "Acme", type: "client", name: "Acme" })
    })
})
