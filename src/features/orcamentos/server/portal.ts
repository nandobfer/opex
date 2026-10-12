import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DevTask } from "@/lib/db/models/DevTask"
import { OrcamentoDraft, type IOrcamentoDraftPreview } from "@/lib/db/models/Orcamento"
import { Project } from "@/lib/db/models/Project"
import { createTaskWithIssue } from "@/features/github/server/task-issue"
import type { TaskDetailDto, TaskDto } from "@/features/tasks/types"
import type { TaskPriority } from "@/features/tasks/constants"
import { addComment, getTask, listTasksForClient, updateTask } from "@/features/tasks/server/service"
import { getBoard } from "@/features/tasks/server/columns"
import type { CreateTaskInput } from "@/features/tasks/schemas"
import { DRAFT_AUDIT_ENTITY } from "../constants"
import { computeClientEstimate } from "../logic"
import type { ClienteDraftInput } from "../schemas"
import type { ClientePortalOptionsDto, ClienteTaskDetailDto, ClienteTaskDto, ClienteTaskEstimateDto, ClienteTaskListDto, DraftEstimateDto, DraftPreviewDto, OrcamentoDraftDto } from "../types"
import { clientProjects } from "./clients"
import {
    clientScope,
    draftToDto,
    getDraft as getScopedDraft,
    getDraftDoc as getScopedDraftDoc,
    githubRepoIndex,
    saveDraftEstimate as saveScopedDraftEstimate,
    saveDraftPreview as saveScopedDraftPreview,
    saveDraftTags as saveScopedDraftTags,
    setDraftCorrection as setScopedDraftCorrection,
    withGithubData,
    type DraftDoc,
} from "./drafts"
import type { ClienteOrcamentoDoc } from "./token"

/**
 * Portal do cliente (SOMENTE servidor): lista de tarefas dos repositórios permitidos, rascunhos de
 * nova tarefa e a aprovação que cria a tarefa de fato. O grosso dos rascunhos é agnóstico de cliente
 * e vive em `drafts.ts` (compartilhado com a prévia do dono, em `/tarefas/previa`).
 */

const OBJECT_ID = /^[a-f0-9]{24}$/i

export async function listClientTasks(client: ClienteOrcamentoDoc, includeArchived: boolean): Promise<ClienteTaskListDto> {
    const list = await listTasksForClient(String(client._id), includeArchived)
    return { tasks: list.tasks.map(toClienteTaskDto), fetchedAt: list.fetchedAt }
}

/** Estimativa segura ao cliente: só horas infladas e faturamento (sem horas reais, fator, custo/hora ou modelo). */
function toClienteEstimate(estimate: TaskDto["estimate"]): ClienteTaskEstimateDto | null {
    return estimate ? { clientHours: estimate.clientHours, billingBrl: estimate.billingBrl } : null
}

/** Tarefa na visão do cliente (lista): remove as horas reais/fator/custo/modelo, as tags e o fluxo da mesa (internos). */
export function toClienteTaskDto(task: TaskDto): ClienteTaskDto {
    const { tags, agenticFlow, ...rest } = task
    void tags
    void agenticFlow
    return { ...rest, estimate: toClienteEstimate(task.estimate) }
}

/** Detalhe na visão do cliente: sem histórico, horas apontadas nem dados internos da estimativa. */
export function toClienteTaskDetail(task: TaskDetailDto): ClienteTaskDetailDto {
    return {
        id: task.id,
        code: task.code,
        columnId: task.columnId,
        order: task.order,
        title: task.title,
        summary: task.summary,
        taskType: task.taskType,
        priority: task.priority,
        archived: task.archived,
        project: task.project,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        estimate: toClienteEstimate(task.estimate),
        description: task.description,
        technicalSpec: task.technicalSpec,
        comments: task.comments,
    }
}

/** Garante que a tarefa é do cliente (a que ele solicitou); caso contrário, 404 (não revela existência). */
async function assertClientTask(client: ClienteOrcamentoDoc, id: string): Promise<void> {
    await dbConnect()
    if (!OBJECT_ID.test(id)) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    const task = await DevTask.findById(id).lean()
    if (!task || task.clientId !== String(client._id)) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
}

/** Detalhe da tarefa na visão do cliente (só as que ele solicitou). */
export async function getClientTask(client: ClienteOrcamentoDoc, id: string): Promise<ClienteTaskDetailDto> {
    await assertClientTask(client, id)
    return toClienteTaskDetail(await getTask(id))
}

/** Comentário do cliente na tarefa (origem marcada pelo **usuário** do portal). */
export async function addClientComment(client: ClienteOrcamentoDoc, id: string, content: string, author: { id: string; name: string }): Promise<void> {
    await assertClientTask(client, id)
    await addComment(id, content, { id: author.id, type: "client", name: author.name })
}

/**
 * Edita a prioridade de uma tarefa na visão do cliente (só as que ele solicitou). Reusa o `updateTask`
 * do núcleo: grava auditoria (`origem: "client"`), publica `tasks-updated` (o dono vê em tempo real)
 * e empurra a prioridade para a issue do GitHub. O ator da auditoria é o **usuário** do portal.
 */
export async function setClientTaskPriority(client: ClienteOrcamentoDoc, id: string, priority: TaskPriority, actorId: string): Promise<void> {
    await assertClientTask(client, id)
    await updateTask(id, { priority }, actorId, { origin: "client" })
}

export async function getClientOptions(client: ClienteOrcamentoDoc): Promise<ClientePortalOptionsDto> {
    const [projects, board, index] = await Promise.all([clientProjects(client), getBoard(), githubRepoIndex()])
    return { clientName: client.name, projects: projects.map((project) => withGithubData(project, index)), board }
}

/** Abre um rascunho (repositório permitido ao cliente + descrição). */
export async function createDraft(client: ClienteOrcamentoDoc, input: ClienteDraftInput): Promise<OrcamentoDraftDto> {
    await dbConnect()
    if (!(client.projectIds ?? []).includes(input.projectId)) throw new DomainError(403, "Repositório não disponível para este cliente", "PROJECT_NOT_ALLOWED")
    const draft = (await OrcamentoDraft.create({
        clientId: String(client._id),
        estimateClientId: null,
        projectId: input.projectId,
        description: input.description,
        correction: null,
        preview: null,
        model: null,
        status: "draft",
        taskId: null,
    })) as unknown as DraftDoc
    return draftToDto(draft)
}

export async function getDraft(client: ClienteOrcamentoDoc, id: string): Promise<OrcamentoDraftDto> {
    return getScopedDraft(clientScope(client), id)
}

export async function setDraftCorrection(client: ClienteOrcamentoDoc, id: string, correction: string): Promise<OrcamentoDraftDto> {
    return setScopedDraftCorrection(clientScope(client), id, correction)
}

/**
 * Grava a prévia gerada pela IA (chamado ao fim do stream). Zera a estimativa e as tags.
 * A avaliação de clareza é **transitória** (vive só na tela): é removida antes de persistir.
 */
export async function saveDraftPreview(client: ClienteOrcamentoDoc, id: string, preview: Omit<DraftPreviewDto, "tags">): Promise<OrcamentoDraftDto> {
    return saveScopedDraftPreview(clientScope(client), id, preview)
}

/** Grava as tags do rascunho (geradas pela feature "Tags de tarefas") na prévia existente. */
export async function saveDraftTags(client: ClienteOrcamentoDoc, id: string, tags: string[]): Promise<void> {
    return saveScopedDraftTags(clientScope(client), id, tags)
}

/** Grava a estimativa de horas (H) e o modelo que a gerou; devolve o orçamento do cliente (H × fator × custo/hora). */
export async function saveDraftEstimate(client: ClienteOrcamentoDoc, id: string, estimatedHours: number, model: string | null): Promise<DraftEstimateDto> {
    return saveScopedDraftEstimate(clientScope(client), id, estimatedHours, model)
}

export async function approveDraft(client: ClienteOrcamentoDoc, id: string, actorId: string, priority?: TaskPriority): Promise<TaskDto> {
    await dbConnect()
    const draft = await getScopedDraftDoc(clientScope(client), id)
    if (draft.status === "approved") throw new DomainError(409, "Este rascunho já foi aprovado", "DRAFT_APPROVED")
    if (!draft.preview) throw new DomainError(409, "Gere a prévia antes de aprovar", "DRAFT_WITHOUT_PREVIEW")
    const project = await Project.findById(draft.projectId).lean()
    if (!project) throw new DomainError(400, "Projeto inválido", "PROJECT_NOT_FOUND")

    const preview = draft.preview as IOrcamentoDraftPreview
    const estimatedHours = typeof draft.estimatedHours === "number" ? draft.estimatedHours : null
    const estimate = estimatedHours != null ? computeClientEstimate(estimatedHours, client.profitFactor, client.hourlyRate) : null
    const input: CreateTaskInput = {
        title: preview.title,
        projectId: draft.projectId,
        columnId: project.entryColumnKey,
        description: draft.description,
        technicalSpec: preview.technicalSpec,
        taskType: (preview.taskType as CreateTaskInput["taskType"]) ?? null,
        priority: (priority ?? preview.priority) as CreateTaskInput["priority"],
    }
    const task = await createTaskWithIssue(input, actorId, {
        origin: "client",
        clientId: String(client._id),
        tags: preview.tags ?? [],
        ...(estimate ? { estimate: { ...estimate, factor: Math.max(1, client.profitFactor || 1), hourlyRate: Math.max(0, client.hourlyRate || 0), model: draft.model ?? null } } : {}),
    })
    await OrcamentoDraft.updateOne({ _id: id }, { $set: { status: "approved", taskId: task.id } })
    await recordAudit({ userId: actorId, entidade: DRAFT_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.APROVAR, depois: { cliente: client.name, tarefa: task.code } })
    return task
}
