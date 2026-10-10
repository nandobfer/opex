import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DevTask } from "@/lib/db/models/DevTask"
import { TimeLog, type ITimeLog } from "@/lib/db/models/TimeLog"
import { appChannel, publishToChannels } from "@/lib/pusher/channels"
import { TIME_UPDATED_EVENT } from "../schemas"
import type { TimeLogDto, TimeLogPageDto } from "../types"

/**
 * Controle de horas agêntico dO Opex — a fonte de verdade. Os apontamentos são períodos de trabalho
 * de uma mesa de desenvolvimento: nascem/fecham **somente pelo servidor** (`beginWorkPeriod` /
 * `endWorkPeriod`), a partir do estado da mesa; a interação humana é somente leitura. Não há regra de
 * "um timer por vez": várias mesas podem ter períodos ativos ao mesmo tempo.
 */

export const TIME_AUDIT_ENTITY = "Apontamento"
const PAGE_SIZE = 100

type Raw = ITimeLog & { _id: unknown }

const iso = (value: Date | null | undefined): string | null => (value ? new Date(value).toISOString() : null)

const minutesBetween = (start: Date, end: Date): number => Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000))

interface TaskInfo {
    code: string
    title: string
}

function toDto(log: Raw, task: TaskInfo | undefined): TimeLogDto {
    return {
        id: String(log._id),
        taskId: log.taskId,
        workbenchId: log.workbenchId ?? null,
        taskCode: task?.code ?? null,
        taskTitle: task?.title ?? null,
        stage: log.stage ?? null,
        agent: log.agent ?? null,
        model: log.model ?? null,
        startTime: new Date(log.startTime).toISOString(),
        endTime: iso(log.endTime),
        duration: log.duration ?? null,
        costUsd: log.costUsd ?? 0,
        inputTokens: log.inputTokens ?? 0,
        outputTokens: log.outputTokens ?? 0,
        reasoningTokens: log.reasoningTokens ?? 0,
        description: log.description ?? null,
        active: log.active === true,
    }
}

async function tasksById(ids: readonly string[]): Promise<Map<string, TaskInfo>> {
    if (ids.length === 0) return new Map()
    const docs = await DevTask.find({ _id: { $in: [...new Set(ids)] } }).select({ code: 1, title: 1 }).lean()
    return new Map(docs.map((task) => [String(task._id), { code: task.code, title: task.title }]))
}

async function publishTimeUpdated(taskIds: (string | null)[]): Promise<void> {
    await publishToChannels([appChannel()], TIME_UPDATED_EVENT, { taskIds: [...new Set(taskIds.filter((id): id is string => Boolean(id)))] })
}

export interface BeginWorkPeriodInput {
    taskId: string
    workbenchId: string
    stage: string | null
    agent: string | null
    model: string | null
    description?: string | null
}

/**
 * Abre um período de trabalho para a mesa. Idempotente por mesa: se já há um período aberto, devolve
 * o existente (sem criar outro). Sem restrição de "um por tarefa" — várias mesas podem estar ativas.
 */
export async function beginWorkPeriod(input: BeginWorkPeriodInput, actorId: string): Promise<TimeLogDto> {
    await dbConnect()
    const existing = await TimeLog.findOne({ workbenchId: input.workbenchId, active: true }).lean()
    const task = await DevTask.findById(input.taskId).select({ code: 1, title: 1 }).lean()
    if (existing) return toDto(existing, task ? { code: task.code, title: task.title } : undefined)
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    const log = await TimeLog.create({
        taskId: input.taskId,
        workbenchId: input.workbenchId,
        stage: input.stage,
        agent: input.agent,
        model: input.model,
        startTime: new Date(),
        active: true,
        description: input.description ?? null,
    })
    await recordAudit({ userId: actorId, entidade: TIME_AUDIT_ENTITY, entidadeId: String(log._id), acao: AcaoAuditoria.CRIAR, depois: { tarefa: task.code, etapa: input.stage, agente: input.agent, modelo: input.model } })
    await publishTimeUpdated([input.taskId])
    return toDto(log.toObject(), { code: task.code, title: task.title })
}

/** Atualiza a etapa/agente/modelo do período aberto da mesa (encadeamento de turnos sem pausa). */
export async function touchWorkPeriod(workbenchId: string, patch: { stage?: string | null; agent?: string | null; model?: string | null; description?: string | null }): Promise<void> {
    await dbConnect()
    const set: Record<string, unknown> = {}
    if (patch.stage !== undefined) set.stage = patch.stage
    if (patch.agent !== undefined) set.agent = patch.agent
    if (patch.model !== undefined) set.model = patch.model
    if (patch.description !== undefined) set.description = patch.description
    if (Object.keys(set).length === 0) return
    await TimeLog.updateOne({ workbenchId, active: true }, { $set: set })
}

/** Acumula tokens/custo no período ativo da mesa (chamado a cada passo do agente). */
export async function accumulateWorkPeriodUsage(workbenchId: string, usage: { costUsd: number; inputTokens: number; outputTokens: number; reasoningTokens: number }): Promise<void> {
    await dbConnect()
    await TimeLog.updateOne(
        { workbenchId, active: true },
        { $inc: { costUsd: usage.costUsd, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, reasoningTokens: usage.reasoningTokens } },
    )
}

/** Fecha o período ativo da mesa (pausa ou conclusão definitiva). */
export async function endWorkPeriod(workbenchId: string, actorId: string, options: { description?: string | null } = {}): Promise<TimeLogDto | null> {
    await dbConnect()
    const log = await TimeLog.findOne({ workbenchId, active: true }).lean()
    if (!log) return null
    const endTime = new Date()
    const duration = minutesBetween(new Date(log.startTime), endTime)
    await TimeLog.updateOne(
        { _id: log._id },
        { $set: { endTime, duration, active: false, ...(options.description !== undefined ? { description: options.description } : {}) } },
    )
    await recordAudit({ userId: actorId, entidade: TIME_AUDIT_ENTITY, entidadeId: String(log._id), acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: log.taskId, minutos: duration, custoUsd: log.costUsd ?? 0, tokens: (log.inputTokens ?? 0) + (log.outputTokens ?? 0) + (log.reasoningTokens ?? 0) } })
    await publishTimeUpdated([log.taskId])
    const task = await DevTask.findById(log.taskId).select({ code: 1, title: 1 }).lean()
    return toDto({ ...log, endTime, duration, active: false, description: options.description !== undefined ? options.description : log.description }, task ? { code: task.code, title: task.title } : undefined)
}

/** Fecha um período ativo pelo id (usado na limpeza de órfãos, inclusive legados sem mesa). */
export async function endWorkPeriodById(id: string, actorId: string, description?: string | null): Promise<void> {
    if (!/^[a-f0-9]{24}$/i.test(id)) return
    await dbConnect()
    const log = await TimeLog.findOne({ _id: id, active: true }).lean()
    if (!log) return
    const endTime = new Date()
    const duration = minutesBetween(new Date(log.startTime), endTime)
    await TimeLog.updateOne({ _id: log._id }, { $set: { endTime, duration, active: false, ...(description !== undefined ? { description } : {}) } })
    await recordAudit({ userId: actorId, entidade: TIME_AUDIT_ENTITY, entidadeId: String(log._id), acao: AcaoAuditoria.ATUALIZAR, depois: { tarefa: log.taskId, minutos: duration, encerrado: true } })
    await publishTimeUpdated([log.taskId])
}

/** Referências dos períodos ativos (para a limpeza de órfãos). */
export async function listActiveWorkPeriods(): Promise<{ id: string; taskId: string; workbenchId: string | null }[]> {
    await dbConnect()
    const docs = await TimeLog.find({ active: true }).select({ taskId: 1, workbenchId: 1 }).lean()
    return docs.map((doc) => ({ id: String(doc._id), taskId: doc.taskId, workbenchId: doc.workbenchId ?? null }))
}

/** Períodos ativos (mais recente primeiro) — tela somente leitura. */
export async function listActiveTimers(): Promise<TimeLogDto[]> {
    await dbConnect()
    const logs = await TimeLog.find({ active: true }).sort({ startTime: -1 }).lean()
    const tasks = await tasksById(logs.map((log) => log.taskId))
    return logs.map((log) => toDto(log, tasks.get(log.taskId)))
}

export async function listTimeLogs(query: { from?: string; to?: string; page: number }): Promise<TimeLogPageDto> {
    await dbConnect()
    const filter: Record<string, unknown> = {}
    if (query.from || query.to) {
        filter.startTime = {
            ...(query.from ? { $gte: new Date(query.from) } : {}),
            ...(query.to ? { $lte: new Date(query.to) } : {}),
        }
    }
    const [logs, total] = await Promise.all([
        TimeLog.find(filter)
            .sort({ startTime: -1 })
            .skip((query.page - 1) * PAGE_SIZE)
            .limit(PAGE_SIZE)
            .lean(),
        TimeLog.countDocuments(filter),
    ])
    const tasks = await tasksById(logs.map((log) => log.taskId))
    const summary = await TimeLog.aggregate<{ totalMinutes: number; totalCostUsd: number }>([
        { $match: filter },
        { $group: { _id: null, totalMinutes: { $sum: { $ifNull: ["$duration", 0] } }, totalCostUsd: { $sum: { $ifNull: ["$costUsd", 0] } } } },
    ])
    return {
        logs: logs.map((log) => toDto(log, tasks.get(log.taskId))),
        page: query.page,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        total,
        totalMinutes: summary[0]?.totalMinutes ?? 0,
        totalCostUsd: summary[0]?.totalCostUsd ?? 0,
    }
}
