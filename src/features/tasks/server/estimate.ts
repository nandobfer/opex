import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DevTask, type ITaskEstimate } from "@/lib/db/models/DevTask"
import { Project } from "@/lib/db/models/Project"
import { computeClientEstimate } from "@/features/orcamentos/logic"
import { estimateHours, logUsage, requireEstimateSettings, type EstimateHoursEvent, type PreparedEstimateHours } from "@/features/orcamentos/server/estimate-hours"
import type { DraftPreviewDto } from "@/features/orcamentos/types"
import type { TaskPriority, TaskType } from "../constants"
import type { TaskEstimate } from "../types"
import { publishTasksUpdated, resolveTaskClient, TASK_AUDIT_ENTITY, toEstimateDto } from "./service"

/**
 * Estimativa por IA de uma **tarefa existente** (SOMENTE servidor): reusa o núcleo de "Estimar
 * prazos" (`estimate-hours.ts`) — tags, tarefas semelhantes e uma chamada de texto/JEV — a partir
 * dos dados da própria tarefa (título, descrição, especificação, tipo e tags), **sem** criar
 * rascunho nem alterar o conteúdo da tarefa. O resultado é gravado como snapshot da estimativa,
 * inflado pelo cliente **atual** da tarefa (sem cliente, snapshot neutro).
 */

const OBJECT_ID = /^[a-f0-9]{24}$/i

const assertTaskId = (id: string) => {
    if (!OBJECT_ID.test(id)) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
}

export type TaskEstimateEvent =
    | { type: "start"; provider: string; model: string }
    | { type: "delta"; text: string }
    | { type: "tool"; id: string; name: string; state: "running" | "done" | "error" }
    | { type: "notice"; message: string }
    | { type: "done"; estimate: TaskEstimate }
    | { type: "error"; message: string }

export interface PreparedTaskEstimate {
    taskId: string
    taskCode: string
    /** `updatedAt` no preparo: se a tarefa mudar durante a geração, a gravação é recusada. */
    taskUpdatedAt: string | null
    core: PreparedEstimateHours
}

/** Monta a entrada da estimativa a partir da tarefa (erros viram JSON antes de abrir o stream). */
export async function prepareTaskEstimate(id: string): Promise<PreparedTaskEstimate> {
    assertTaskId(id)
    await dbConnect()
    const task = await DevTask.findById(id).lean()
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    const settings = await requireEstimateSettings()
    const project = await Project.findById(task.projectId).lean()
    const projectName = project?.name ?? task.projectId
    const preview: DraftPreviewDto = {
        title: task.title,
        taskType: (task.taskType as TaskType | null) ?? null,
        priority: (task.priority as TaskPriority) ?? "medium",
        technicalSpec: task.technicalSpec ?? "",
        summary: task.summary ?? "",
        tags: task.tags ?? [],
    }
    return {
        taskId: id,
        taskCode: task.code,
        taskUpdatedAt: task.updatedAt ? new Date(task.updatedAt).toISOString() : null,
        core: {
            settings,
            projectId: task.projectId,
            preview,
            input: { projectName, description: task.description ?? "", correction: null },
            title: `Tarefa ${task.code}`,
            subject: `task:${id}`,
        },
    }
}

/** Grava o snapshot da estimativa com a inflação do cliente **atual** da tarefa. */
async function saveTaskEstimate(prepared: PreparedTaskEstimate, hours: number, model: string, actorId: string): Promise<TaskEstimate> {
    await dbConnect()
    const task = await DevTask.findById(prepared.taskId).lean()
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    if ((task.updatedAt ? new Date(task.updatedAt).toISOString() : null) !== prepared.taskUpdatedAt) {
        throw new DomainError(409, "A tarefa mudou durante a estimativa. Tente novamente.", "TASK_CHANGED")
    }

    const before = task.estimate
    const client = await resolveTaskClient(task)
    const factor = client ? client.profitFactor : 1
    const hourlyRate = client ? client.hourlyRate : 0
    const next = computeClientEstimate(hours, factor, hourlyRate)
    const estimate: ITaskEstimate = { hours: next.hours, clientHours: next.clientHours, billingBrl: next.billingBrl, factor, hourlyRate, model, generatedAt: new Date() }

    await DevTask.updateOne({ _id: prepared.taskId }, { $set: { estimate } })
    await recordAudit({
        userId: actorId,
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: prepared.taskId,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { codigo: task.code, horasEstimadas: before?.hours ?? 0, faturamentoEstimado: before?.billingBrl ?? 0 },
        depois: { codigo: task.code, horasEstimadas: next.hours, faturamentoEstimado: next.billingBrl, estimativa: "gerada por IA", modelo: model },
    })
    await publishTasksUpdated([prepared.taskId])
    return toEstimateDto(estimate)
}

/** Roda a estimativa em streaming e grava o resultado na tarefa ao final. */
export async function* runTaskEstimate(prepared: PreparedTaskEstimate, actorId: string, signal?: AbortSignal): AsyncGenerator<TaskEstimateEvent> {
    const { settings } = prepared.core
    const startedAt = Date.now()

    let estimated: Extract<EstimateHoursEvent, { type: "estimated" }> | null = null
    for await (const event of estimateHours(prepared.core, {}, signal)) {
        if (event.type === "estimated") {
            estimated = event
            continue
        }
        yield event
    }
    if (!estimated) return

    try {
        const estimate = await saveTaskEstimate(prepared, estimated.hours, estimated.model, actorId)
        await logUsage("estimate-hours", settings, prepared.core.subject, true, null, startedAt, estimated.usage)
        yield { type: "done", estimate }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao salvar a estimativa"
        await logUsage("estimate-hours", settings, prepared.core.subject, false, message, startedAt, null)
        yield { type: "error", message }
    }
}
