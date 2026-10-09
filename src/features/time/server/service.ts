import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { appChannel, publishToChannels } from "@/lib/pusher/channels"
import { goSipalRequest } from "@/features/go-sipal/client"
import { fetchAllTasks, toTaskDomainError } from "@/features/tasks/server/service"
import { TIME_UPDATED_EVENT, type StartTimerInput, type StopTimerInput, type UpdateTimeLogInput } from "../schemas"
import type { TimeLogDto, TimeLogPageDto } from "../types"

/**
 * Controle de horas direto no Go! Sipal (`/api/dev-center/time-logs`, conferido em
 * `~/code/sap-painel-lancamento`). Nada é salvo nO Opex. Somente servidor.
 */

export const TIME_AUDIT_ENTITY = "ApontamentoGoSipal"

type Raw = Record<string, unknown>
const isObj = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value)
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null)
const iso = (value: unknown): string | null => {
    if (typeof value !== "string" && !(value instanceof Date)) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
const idOf = (value: unknown): string | null => (typeof value === "string" && value ? value : isObj(value) ? (str(value._id) ?? str(value.id)) : null)

/** Normaliza um apontamento; `codes` = id da tarefa → código (o Go! Sipal só devolve título/produto). */
export function toTimeLogDto(raw: unknown, codes: ReadonlyMap<string, string> = new Map()): TimeLogDto | null {
    if (!isObj(raw)) return null
    const id = idOf(raw)
    const startTime = iso(raw.startTime)
    if (!id || !startTime) return null
    const task = isObj(raw.task) ? raw.task : null
    const taskId = task ? idOf(task) : idOf(raw.task)
    const product = task && isObj(task.product) ? task.product : null
    return {
        id,
        taskId,
        taskCode: taskId ? (codes.get(taskId) ?? null) : null,
        taskTitle: task ? str(task.title) : null,
        productName: product ? str(product.name) : null,
        startTime,
        endTime: iso(raw.endTime),
        duration: typeof raw.duration === "number" && Number.isFinite(raw.duration) ? raw.duration : null,
        description: str(raw.description),
        active: raw.isActive === true,
    }
}

// Códigos das tarefas (id → GO-DEV-n), em memória por 2 min: o quadro muda pouco e a leitura é cara.
const CODES_TTL_MS = 2 * 60_000
let codesCache: { at: number; codes: Map<string, string> } | null = null

export async function taskCodes(): Promise<ReadonlyMap<string, string>> {
    if (codesCache && Date.now() - codesCache.at < CODES_TTL_MS) return codesCache.codes
    try {
        const tasks = await fetchAllTasks({ includeArchived: true })
        codesCache = { at: Date.now(), codes: new Map(tasks.map((task) => [task.id, task.code])) }
    } catch {
        // Sem quadro (ex.: falha momentânea): segue sem códigos.
        return codesCache?.codes ?? new Map()
    }
    return codesCache.codes
}

/** Só para testes. */
export function resetTaskCodesCache(): void {
    codesCache = null
}

async function call<T>(path: string, options: Parameters<typeof goSipalRequest>[1]): Promise<T> {
    try {
        return await goSipalRequest<T>(path, options)
    } catch (error) {
        toTaskDomainError(error)
    }
}

async function publishTimeUpdated(taskIds: (string | null)[]): Promise<void> {
    await publishToChannels([appChannel()], TIME_UPDATED_EVENT, { taskIds: taskIds.filter((id): id is string => Boolean(id)) })
}

const assertId = (id: string) => {
    if (!/^[a-f0-9]{24}$/i.test(id)) throw new DomainError(404, "Apontamento não encontrado", "TIME_LOG_NOT_FOUND")
}

/** Timers ativos do usuário da sessão (mais recente primeiro). */
export async function listActiveTimers(): Promise<TimeLogDto[]> {
    const body = await call<{ data?: unknown }>("/api/dev-center/time-logs/active", { label: "timers ativos" })
    const raw = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : []
    const codes = raw.length ? await taskCodes() : new Map<string, string>()
    return raw.map((item) => toTimeLogDto(item, codes)).filter((log): log is TimeLogDto => log !== null && log.active)
}

export async function startTimer(input: StartTimerInput, actorId: string): Promise<TimeLogDto> {
    const body = await call<{ data?: unknown }>("/api/dev-center/time-logs", { method: "POST", body: { taskId: input.taskId, elementType: "devTask" }, label: "iniciar timer" })
    const log = toTimeLogDto(body?.data, await taskCodes())
    if (!log) throw new DomainError(502, "O Go! Sipal não devolveu o timer iniciado", "GO_SIPAL_UNAVAILABLE")
    await recordAudit({ userId: actorId, entidade: TIME_AUDIT_ENTITY, entidadeId: log.id, acao: AcaoAuditoria.CRIAR, depois: { tarefa: log.taskCode ?? input.taskId, inicio: log.startTime } })
    await publishTimeUpdated([log.taskId])
    return log
}

export async function stopTimer(id: string, input: StopTimerInput, actorId: string): Promise<TimeLogDto> {
    assertId(id)
    const body = await call<{ data?: unknown }>(`/api/dev-center/time-logs/${id}`, {
        method: "PUT",
        body: {
            stop: true,
            ...(input.description ? { description: input.description } : {}),
            ...(input.startTime ? { startTime: input.startTime } : {}),
            ...(input.endTime ? { endTime: input.endTime } : {}),
        },
        label: "parar timer",
    })
    const log = toTimeLogDto(body?.data, await taskCodes())
    if (!log) throw new DomainError(502, "O Go! Sipal não devolveu o timer parado", "GO_SIPAL_UNAVAILABLE")
    await recordAudit({
        userId: actorId,
        entidade: TIME_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        depois: { tarefa: log.taskCode ?? input.taskCode ?? log.taskId, inicio: log.startTime, fim: log.endTime, minutos: log.duration, parado: true },
    })
    await publishTimeUpdated([log.taskId])
    return log
}

/** Meus apontamentos no período (o Go! Sipal filtra pelo início e pagina de 100 em 100). */
export async function listTimeLogs(query: { from?: string; to?: string; page: number }): Promise<TimeLogPageDto> {
    const params = new URLSearchParams({ limit: "100", page: String(query.page) })
    if (query.from) params.set("startDate", new Date(query.from).toISOString())
    if (query.to) params.set("endDate", new Date(query.to).toISOString())
    const body = await call<{ data?: unknown; pagination?: Raw; summary?: Raw }>(`/api/dev-center/time-logs?${params}`, { label: "meus apontamentos" })
    const raw = Array.isArray(body?.data) ? body.data : []
    const codes = raw.length ? await taskCodes() : new Map<string, string>()
    const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback)
    return {
        logs: raw.map((item) => toTimeLogDto(item, codes)).filter((log): log is TimeLogDto => log !== null),
        page: num(body?.pagination?.page, query.page),
        totalPages: num(body?.pagination?.totalPages, 1),
        total: num(body?.pagination?.total, raw.length),
        totalMinutes: num(body?.summary?.totalMinutes, 0),
    }
}

export async function updateTimeLog(id: string, input: UpdateTimeLogInput, actorId: string): Promise<void> {
    assertId(id)
    const body =
        input.kind === "description"
            ? { description: input.description }
            : { startTime: new Date(input.startTime).toISOString(), endTime: new Date(input.endTime).toISOString(), justification: input.justification }
    const result = await call<{ data?: unknown }>(`/api/dev-center/time-logs/${id}`, { method: "PUT", body, label: "editar apontamento" })
    const log = toTimeLogDto(result?.data)
    await recordAudit({
        userId: actorId,
        entidade: TIME_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        depois: input.kind === "description" ? { descricao: input.description } : { inicio: body.startTime, fim: body.endTime, justificativa: input.justification },
    })
    await publishTimeUpdated([log?.taskId ?? null])
}

export async function deleteTimeLog(id: string, justification: string, actorId: string): Promise<void> {
    assertId(id)
    await call(`/api/dev-center/time-logs/${id}`, { method: "DELETE", body: { justification }, label: "excluir apontamento" })
    await recordAudit({ userId: actorId, entidade: TIME_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { justificativa: justification } })
    await publishTimeUpdated([])
}
