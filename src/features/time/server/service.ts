import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DevTask } from "@/lib/db/models/DevTask"
import { TimeLog, type ITimeLog } from "@/lib/db/models/TimeLog"
import { appChannel, publishToChannels } from "@/lib/pusher/channels"
import { TIME_UPDATED_EVENT, type StartTimerInput, type StopTimerInput, type UpdateTimeLogInput } from "../schemas"
import type { TimeLogDto, TimeLogPageDto } from "../types"

/**
 * Controle de horas dO Opex — a fonte de verdade. CRUD sobre `time_logs`; um timer ativo por
 * tarefa. Módulo somente servidor.
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
        taskCode: task?.code ?? null,
        taskTitle: task?.title ?? null,
        startTime: new Date(log.startTime).toISOString(),
        endTime: iso(log.endTime),
        duration: log.duration ?? null,
        description: log.description ?? null,
        active: log.active === true,
    }
}

async function tasksById(ids: readonly string[]): Promise<Map<string, TaskInfo>> {
    if (ids.length === 0) return new Map()
    const docs = await DevTask.find({ _id: { $in: [...new Set(ids)] } }).select({ code: 1, title: 1 }).lean()
    return new Map(docs.map((task) => [String(task._id), { code: task.code, title: task.title }]))
}

const assertId = (id: string) => {
    if (!/^[a-f0-9]{24}$/i.test(id)) throw new DomainError(404, "Apontamento não encontrado", "TIME_LOG_NOT_FOUND")
}

async function publishTimeUpdated(taskIds: (string | null)[]): Promise<void> {
    await publishToChannels([appChannel()], TIME_UPDATED_EVENT, { taskIds: [...new Set(taskIds.filter((id): id is string => Boolean(id)))] })
}

/** Timers ativos (mais recente primeiro). */
export async function listActiveTimers(): Promise<TimeLogDto[]> {
    await dbConnect()
    const logs = await TimeLog.find({ active: true }).sort({ startTime: -1 }).lean()
    const tasks = await tasksById(logs.map((log) => log.taskId))
    return logs.map((log) => toDto(log, tasks.get(log.taskId)))
}

export async function startTimer(input: StartTimerInput, actorId: string): Promise<TimeLogDto> {
    await dbConnect()
    const task = await DevTask.findById(input.taskId).lean()
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    if (await TimeLog.exists({ taskId: input.taskId, active: true })) throw new DomainError(409, "Já existe um timer ativo para esta tarefa", "TIMER_RUNNING")
    const log = await TimeLog.create({ taskId: input.taskId, startTime: new Date(), active: true })
    await recordAudit({ userId: actorId, entidade: TIME_AUDIT_ENTITY, entidadeId: String(log._id), acao: AcaoAuditoria.CRIAR, depois: { tarefa: task.code, inicio: log.startTime.toISOString() } })
    await publishTimeUpdated([input.taskId])
    return toDto(log.toObject(), { code: task.code, title: task.title })
}

export async function stopTimer(id: string, input: StopTimerInput, actorId: string): Promise<TimeLogDto> {
    assertId(id)
    await dbConnect()
    const log = await TimeLog.findById(id).lean()
    if (!log) throw new DomainError(404, "Apontamento não encontrado", "TIME_LOG_NOT_FOUND")
    const startTime = input.startTime ? new Date(input.startTime) : new Date(log.startTime)
    const endTime = input.endTime ? new Date(input.endTime) : new Date()
    if (endTime.getTime() <= startTime.getTime()) throw new DomainError(400, "O fim deve ser depois do início", "TIME_LOG_INVALID")
    const duration = minutesBetween(startTime, endTime)
    await TimeLog.updateOne({ _id: id }, { $set: { startTime, endTime, duration, description: input.description?.trim() || null, active: false } })
    await recordAudit({ userId: actorId, entidade: TIME_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { inicio: startTime.toISOString(), fim: endTime.toISOString(), minutos: duration, parado: true } })
    await publishTimeUpdated([log.taskId])
    const task = await DevTask.findById(log.taskId).select({ code: 1, title: 1 }).lean()
    return toDto({ ...log, startTime, endTime, duration, description: input.description?.trim() || null, active: false }, task ? { code: task.code, title: task.title } : undefined)
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
    const summary = await TimeLog.aggregate<{ total: number }>([{ $match: filter }, { $group: { _id: null, total: { $sum: { $ifNull: ["$duration", 0] } } } }])
    return {
        logs: logs.map((log) => toDto(log, tasks.get(log.taskId))),
        page: query.page,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        total,
        totalMinutes: summary[0]?.total ?? 0,
    }
}

export async function updateTimeLog(id: string, input: UpdateTimeLogInput, actorId: string): Promise<void> {
    assertId(id)
    await dbConnect()
    const log = await TimeLog.findById(id).lean()
    if (!log) throw new DomainError(404, "Apontamento não encontrado", "TIME_LOG_NOT_FOUND")
    if (input.kind === "description") {
        await TimeLog.updateOne({ _id: id }, { $set: { description: input.description.trim() || null } })
        await recordAudit({ userId: actorId, entidade: TIME_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { descricao: input.description } })
    } else {
        const startTime = new Date(input.startTime)
        const endTime = new Date(input.endTime)
        const duration = minutesBetween(startTime, endTime)
        await TimeLog.updateOne({ _id: id }, { $set: { startTime, endTime, duration } })
        await recordAudit({ userId: actorId, entidade: TIME_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { inicio: startTime.toISOString(), fim: endTime.toISOString(), minutos: duration } })
    }
    await publishTimeUpdated([log.taskId])
}

export async function deleteTimeLog(id: string, actorId: string): Promise<void> {
    assertId(id)
    await dbConnect()
    const log = await TimeLog.findById(id).lean()
    if (!log) throw new DomainError(404, "Apontamento não encontrado", "TIME_LOG_NOT_FOUND")
    await TimeLog.deleteOne({ _id: id })
    await recordAudit({ userId: actorId, entidade: TIME_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { inicio: iso(log.startTime), minutos: log.duration } })
    await publishTimeUpdated([log.taskId])
}
