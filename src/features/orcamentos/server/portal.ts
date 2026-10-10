import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { OrcamentoDraft, type IOrcamentoDraft, type IOrcamentoDraftPreview } from "@/lib/db/models/Orcamento"
import { Project } from "@/lib/db/models/Project"
import { createTaskWithIssue } from "@/features/github/server/task-issue"
import { listTasksForProjects } from "@/features/tasks/server/service"
import { getBoard } from "@/features/tasks/server/columns"
import type { CreateTaskInput } from "@/features/tasks/schemas"
import type { TaskDto, TaskListDto } from "@/features/tasks/types"
import { DRAFT_AUDIT_ENTITY } from "../constants"
import { computeClientEstimate, type ClientEstimate } from "../logic"
import type { ClienteDraftInput } from "../schemas"
import type { ClientePortalOptionsDto, DraftEstimateDto, DraftPreviewDto, OrcamentoDraftDto } from "../types"
import { clientProjects } from "./clients"
import type { ClienteOrcamentoDoc } from "./token"

/**
 * Portal do cliente (SOMENTE servidor): lista de tarefas dos repositórios permitidos, rascunhos de
 * nova tarefa e a aprovação que cria a tarefa de fato.
 */

type DraftDoc = IOrcamentoDraft & { _id: unknown }

const OBJECT_ID = /^[a-f0-9]{24}$/i

const toEstimateDto = (estimate: ClientEstimate): DraftEstimateDto => ({ hours: estimate.hours, clientHours: estimate.clientHours, billingBrl: estimate.billingBrl })

export async function listClientTasks(client: ClienteOrcamentoDoc, includeArchived: boolean): Promise<TaskListDto> {
    return listTasksForProjects(client.projectIds ?? [], includeArchived)
}

export async function getClientOptions(client: ClienteOrcamentoDoc): Promise<ClientePortalOptionsDto> {
    return { clientName: client.name, projects: await clientProjects(client), board: await getBoard() }
}

function draftPreview(draft: DraftDoc): DraftPreviewDto | null {
    const preview = draft.preview
    if (!preview) return null
    return { title: preview.title, taskType: (preview.taskType as DraftPreviewDto["taskType"]) ?? null, priority: preview.priority as DraftPreviewDto["priority"], technicalSpec: preview.technicalSpec, summary: preview.summary, estimatedHours: preview.estimatedHours }
}

async function draftToDto(draft: DraftDoc, client: ClienteOrcamentoDoc): Promise<OrcamentoDraftDto> {
    const project = await Project.findById(draft.projectId).lean()
    const preview = draftPreview(draft)
    return {
        id: String(draft._id),
        projectId: draft.projectId,
        projectName: project?.name ?? null,
        description: draft.description,
        correction: draft.correction ?? null,
        preview,
        model: draft.model ?? null,
        status: draft.status,
        taskId: draft.taskId ?? null,
        estimate: preview ? toEstimateDto(computeClientEstimate(preview.estimatedHours, client.profitFactor, client.hourlyRate)) : null,
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

/** Grava a prévia gerada pela IA (chamado ao fim do stream). */
export async function saveDraftPreview(client: ClienteOrcamentoDoc, id: string, preview: DraftPreviewDto, model: string | null): Promise<OrcamentoDraftDto> {
    await getDraftDoc(client, id)
    await OrcamentoDraft.updateOne({ _id: id }, { $set: { preview, model } })
    return getDraft(client, id)
}

export async function approveDraft(client: ClienteOrcamentoDoc, id: string, actorId: string): Promise<TaskDto> {
    await dbConnect()
    const draft = await getDraftDoc(client, id)
    if (draft.status === "approved") throw new DomainError(409, "Este rascunho já foi aprovado", "DRAFT_APPROVED")
    if (!draft.preview) throw new DomainError(409, "Gere a prévia antes de aprovar", "DRAFT_WITHOUT_PREVIEW")
    const project = await Project.findById(draft.projectId).lean()
    if (!project) throw new DomainError(400, "Projeto inválido", "PROJECT_NOT_FOUND")

    const preview = draft.preview as IOrcamentoDraftPreview
    const estimate = computeClientEstimate(preview.estimatedHours, client.profitFactor, client.hourlyRate)
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
        estimate: { ...estimate, factor: Math.max(1, client.profitFactor || 1), hourlyRate: Math.max(0, client.hourlyRate || 0), model: draft.model ?? null },
    })
    await OrcamentoDraft.updateOne({ _id: id }, { $set: { status: "approved", taskId: task.id } })
    await recordAudit({ userId: actorId, entidade: DRAFT_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.APROVAR, depois: { cliente: client.name, tarefa: task.code } })
    return task
}
