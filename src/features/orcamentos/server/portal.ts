import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { OrcamentoDraft, type IOrcamentoDraft, type IOrcamentoDraftPreview } from "@/lib/db/models/Orcamento"
import { Project } from "@/lib/db/models/Project"
import { createTaskWithIssue } from "@/features/github/server/task-issue"
import { listGithubRepos } from "@/features/github/server/lookups"
import type { GithubRepoOption } from "@/features/github/types"
import type { ProjectRef } from "@/features/tasks/types"
import { listTasksForProjects } from "@/features/tasks/server/service"
import { getBoard } from "@/features/tasks/server/columns"
import type { CreateTaskInput } from "@/features/tasks/schemas"
import type { TaskDto, TaskListDto } from "@/features/tasks/types"
import { DRAFT_AUDIT_ENTITY } from "../constants"
import { computeClientEstimate, type ClientEstimate } from "../logic"
import type { ClienteDraftInput } from "../schemas"
import type { ClientePortalOptionsDto, ClienteRepoDto, DraftEstimateDto, DraftPreviewDto, OrcamentoDraftDto } from "../types"
import { clientProjects } from "./clients"
import type { ClienteOrcamentoDoc } from "./token"

/**
 * Portal do cliente (SOMENTE servidor): lista de tarefas dos repositórios permitidos, rascunhos de
 * nova tarefa e a aprovação que cria a tarefa de fato.
 */

type DraftDoc = IOrcamentoDraft & { _id: unknown }

const OBJECT_ID = /^[a-f0-9]{24}$/i

const toEstimateDto = (estimate: ClientEstimate): DraftEstimateDto => ({ hours: estimate.hours, clientHours: estimate.clientHours, billingBrl: estimate.billingBrl })

/**
 * Índice `owner/repo` (minúsculo) → repositório do GitHub, best-effort: sem token configurado ou
 * com a API fora, o portal segue funcionando com o rótulo sem avatar (o `GithubRepoLabel` cai na
 * inicial). O resultado do `listGithubRepos` já é cacheado por 5 min.
 */
async function githubRepoIndex(): Promise<Map<string, GithubRepoOption>> {
    try {
        return new Map((await listGithubRepos()).map((repo) => [repo.fullName, repo]))
    } catch {
        return new Map()
    }
}

/** Projeto + dados do GitHub (avatar, descrição e privacidade) para o `GithubRepoLabel` do portal. */
function withGithubData(project: ProjectRef, index: Map<string, GithubRepoOption>): ClienteRepoDto {
    const repo = index.get(project.repo.toLowerCase())
    return { ...project, ownerAvatarUrl: repo?.ownerAvatarUrl ?? null, description: repo?.description ?? null, private: repo?.private ?? false }
}

export async function listClientTasks(client: ClienteOrcamentoDoc, includeArchived: boolean): Promise<TaskListDto> {
    return listTasksForProjects(client.projectIds ?? [], includeArchived)
}

export async function getClientOptions(client: ClienteOrcamentoDoc): Promise<ClientePortalOptionsDto> {
    const [projects, board, index] = await Promise.all([clientProjects(client), getBoard(), githubRepoIndex()])
    return { clientName: client.name, projects: projects.map((project) => withGithubData(project, index)), board }
}

function draftPreview(draft: DraftDoc): DraftPreviewDto | null {
    const preview = draft.preview
    if (!preview) return null
    return { title: preview.title, taskType: (preview.taskType as DraftPreviewDto["taskType"]) ?? null, priority: preview.priority as DraftPreviewDto["priority"], technicalSpec: preview.technicalSpec, summary: preview.summary }
}

async function draftToDto(draft: DraftDoc, client: ClienteOrcamentoDoc): Promise<OrcamentoDraftDto> {
    const [project, index] = await Promise.all([Project.findById(draft.projectId).lean(), githubRepoIndex()])
    const preview = draftPreview(draft)
    const estimatedHours = typeof draft.estimatedHours === "number" ? draft.estimatedHours : null
    return {
        id: String(draft._id),
        projectId: draft.projectId,
        projectName: project?.name ?? null,
        projectRepo: project ? withGithubData({ id: String(project._id), name: project.name, repo: project.repo, sigla: project.sigla }, index) : null,
        description: draft.description,
        correction: draft.correction ?? null,
        preview,
        model: draft.model ?? null,
        status: draft.status,
        taskId: draft.taskId ?? null,
        estimate: estimatedHours != null ? toEstimateDto(computeClientEstimate(estimatedHours, client.profitFactor, client.hourlyRate)) : null,
        createdAt: draft.createdAt ? new Date(draft.createdAt).toISOString() : null,
    }
}

export async function createDraft(client: ClienteOrcamentoDoc, input: ClienteDraftInput): Promise<OrcamentoDraftDto> {
    await dbConnect()
    if (!(client.projectIds ?? []).includes(input.projectId)) throw new DomainError(403, "Repositório não disponível para este cliente", "PROJECT_NOT_ALLOWED")
    const draft = (await OrcamentoDraft.create({ clientId: String(client._id), projectId: input.projectId, description: input.description, correction: null, preview: null, model: null, status: "draft", taskId: null })) as unknown as DraftDoc
    return draftToDto(draft, client)
}

export async function getDraft(client: ClienteOrcamentoDoc, id: string): Promise<OrcamentoDraftDto> {
    await dbConnect()
    if (!OBJECT_ID.test(id)) throw new DomainError(404, "Rascunho não encontrado", "DRAFT_NOT_FOUND")
    const draft = (await OrcamentoDraft.findOne({ _id: id, clientId: String(client._id) }).lean()) as DraftDoc | null
    if (!draft) throw new DomainError(404, "Rascunho não encontrado", "DRAFT_NOT_FOUND")
    return draftToDto(draft, client)
}

/** Documento do rascunho (uso interno do servidor). */
export async function getDraftDoc(client: ClienteOrcamentoDoc, id: string): Promise<DraftDoc> {
    await dbConnect()
    if (!OBJECT_ID.test(id)) throw new DomainError(404, "Rascunho não encontrado", "DRAFT_NOT_FOUND")
    const draft = (await OrcamentoDraft.findOne({ _id: id, clientId: String(client._id) }).lean()) as DraftDoc | null
    if (!draft) throw new DomainError(404, "Rascunho não encontrado", "DRAFT_NOT_FOUND")
    return draft
}

export async function setDraftCorrection(client: ClienteOrcamentoDoc, id: string, correction: string): Promise<OrcamentoDraftDto> {
    const draft = await getDraftDoc(client, id)
    if (draft.status !== "draft") throw new DomainError(409, "Este rascunho já foi aprovado", "DRAFT_APPROVED")
    await OrcamentoDraft.updateOne({ _id: draft._id }, { $set: { correction } })
    return draftToDto({ ...draft, correction }, client)
}

/** Grava a prévia gerada pela IA (chamado ao fim do stream). Zera a estimativa (nova correção). */
export async function saveDraftPreview(client: ClienteOrcamentoDoc, id: string, preview: DraftPreviewDto, model: string | null): Promise<OrcamentoDraftDto> {
    await getDraftDoc(client, id)
    await OrcamentoDraft.updateOne({ _id: id }, { $set: { preview, estimatedHours: null, model } })
    return getDraft(client, id)
}

/** Grava a estimativa de horas (H) e devolve o orçamento do cliente (H × fator × custo/hora). */
export async function saveDraftEstimate(client: ClienteOrcamentoDoc, id: string, estimatedHours: number): Promise<DraftEstimateDto> {
    await getDraftDoc(client, id)
    await OrcamentoDraft.updateOne({ _id: id }, { $set: { estimatedHours } })
    return toEstimateDto(computeClientEstimate(estimatedHours, client.profitFactor, client.hourlyRate))
}

export async function approveDraft(client: ClienteOrcamentoDoc, id: string, actorId: string): Promise<TaskDto> {
    await dbConnect()
    const draft = await getDraftDoc(client, id)
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
        priority: preview.priority as CreateTaskInput["priority"],
    }
    const task = await createTaskWithIssue(input, actorId, {
        origin: "client",
        ...(estimate ? { estimate: { ...estimate, factor: Math.max(1, client.profitFactor || 1), hourlyRate: Math.max(0, client.hourlyRate || 0), model: draft.model ?? null } } : {}),
    })
    await OrcamentoDraft.updateOne({ _id: id }, { $set: { status: "approved", taskId: task.id } })
    await recordAudit({ userId: actorId, entidade: DRAFT_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.APROVAR, depois: { cliente: client.name, tarefa: task.code } })
    return task
}
