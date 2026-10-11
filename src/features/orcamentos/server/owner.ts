import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { OrcamentoDraft, type IOrcamentoDraftPreview } from "@/lib/db/models/Orcamento"
import { Project } from "@/lib/db/models/Project"
import { createTaskWithIssue } from "@/features/github/server/task-issue"
import type { CreateTaskInput } from "@/features/tasks/schemas"
import type { TaskPriority } from "@/features/tasks/constants"
import type { TaskDto } from "@/features/tasks/types"
import { DRAFT_AUDIT_ENTITY } from "../constants"
import { computeClientEstimate } from "../logic"
import type { ClienteDraftInput } from "../schemas"
import type { DraftEstimateDto, DraftTagDto, OrcamentoDraftDto } from "../types"
import { assertDraftEditable, draftToDto, estimateOfDraft, getDraft, getDraftDoc, OWNER_SCOPE, resolveDraftClient, setDraftCorrection, setDraftEstimateClient, type DraftDoc } from "./drafts"
import { resolveTagViews } from "./tag-views"

/**
 * Prévia do dono (SOMENTE servidor): o fluxo do portal do cliente aberto em `/tarefas/previa`. Um
 * rascunho do dono tem `clientId: null` (nunca aparece na lista nem no portal) e pode escolher um
 * cliente **opcional** só para o cálculo do custo (`estimateClientId`).
 */

/** Abre um rascunho do dono (repositório vinculado + descrição). */
export async function createOwnerDraft(input: ClienteDraftInput): Promise<OrcamentoDraftDto> {
    await dbConnect()
    const project = await Project.findById(input.projectId).lean()
    if (!project) throw new DomainError(400, "Projeto inválido", "PROJECT_NOT_FOUND")
    const draft = (await OrcamentoDraft.create({
        clientId: null,
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

export const getOwnerDraft = (id: string): Promise<OrcamentoDraftDto> => getDraft(OWNER_SCOPE, id)

export const getOwnerDraftDoc = (id: string): Promise<DraftDoc> => getDraftDoc(OWNER_SCOPE, id)

/** Exige um rascunho do dono em edição (409 se já aprovado), usado antes das fases de IA. */
export async function requireOwnerDraftEditable(id: string): Promise<DraftDoc> {
    const draft = await getOwnerDraftDoc(id)
    assertDraftEditable(draft)
    return draft
}

/** Define, troca ou limpa o cliente **opcional** usado no cálculo do custo da estimativa. */
export const setOwnerEstimateClient = (id: string, clientId: string | null): Promise<void> => setDraftEstimateClient(OWNER_SCOPE, id, clientId)

/** Registra o ajuste pedido pelo dono (a prévia é regenerada em seguida e a estimativa é zerada). */
export const setOwnerCorrection = (id: string, correction: string): Promise<OrcamentoDraftDto> => setDraftCorrection(OWNER_SCOPE, id, correction)

/**
 * Recalcula **só o custo** do rascunho (SEM IA), reusando as horas/modelo já estimados e o cliente
 * escolhido. Devolve junto as tags da prévia (o stream do dono as reenvia no `done`).
 */
export async function recomputeOwnerEstimate(draft: DraftDoc): Promise<{ estimate: DraftEstimateDto; tags: DraftTagDto[] }> {
    const estimate = estimateOfDraft(draft, await resolveDraftClient(draft))
    if (!estimate) throw new DomainError(409, "Gere a estimativa antes de calcular o custo", "DRAFT_WITHOUT_ESTIMATE")
    return { estimate, tags: await resolveTagViews(draft.preview?.tags ?? []) }
}

/**
 * Aprova a prévia do dono e cria a tarefa (com issue no GitHub, como no app). Sem cliente escolhido,
 * a tarefa nasce **sem** `clientId` nem `estimate`; com cliente, grava o snapshot do orçamento.
 */
export async function approveOwnerDraft(id: string, actorId: string, priority?: TaskPriority): Promise<TaskDto> {
    await dbConnect()
    const draft = await getOwnerDraftDoc(id)
    if (draft.status === "approved") throw new DomainError(409, "Este rascunho já foi aprovado", "DRAFT_APPROVED")
    if (!draft.preview) throw new DomainError(409, "Gere a prévia antes de aprovar", "DRAFT_WITHOUT_PREVIEW")
    const project = await Project.findById(draft.projectId).lean()
    if (!project) throw new DomainError(400, "Projeto inválido", "PROJECT_NOT_FOUND")

    const preview = draft.preview as IOrcamentoDraftPreview
    const client = await resolveDraftClient(draft)
    const estimatedHours = typeof draft.estimatedHours === "number" ? draft.estimatedHours : null
    const estimate = client && estimatedHours != null ? computeClientEstimate(estimatedHours, client.profitFactor, client.hourlyRate) : null
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
        origin: "opex",
        tags: preview.tags ?? [],
        ...(estimate && client
            ? { clientId: String(client._id), estimate: { ...estimate, factor: Math.max(1, client.profitFactor || 1), hourlyRate: Math.max(0, client.hourlyRate || 0), model: draft.model ?? null } }
            : {}),
    })
    await OrcamentoDraft.updateOne({ _id: draft._id }, { $set: { status: "approved", taskId: task.id } })
    await recordAudit({ userId: actorId, entidade: DRAFT_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.APROVAR, depois: { cliente: client?.name ?? null, tarefa: task.code } })
    return task
}
