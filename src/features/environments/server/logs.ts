import { hostname } from "os"
import { dbConnect } from "@/lib/db"
import { EnvironmentLog } from "@/lib/db/models/EnvironmentLog"
import { logger } from "@/lib/logger"
import { formatLogLine, maskSensitive } from "@/lib/integrations/log-format"
import type { EnvironmentLogLine, EnvironmentLogLevel } from "../types"
import { publishEnvironmentLogs } from "./realtime"

/**
 * Logs dos ambientes: gravados em `environment_logs` (TTL 48 h, como o console de integrações),
 * retransmitidos pelo Pusher no canal do ambiente e lidos pela tela (com cursor `after`).
 * Segredos conhecidos são mascarados ANTES de qualquer destino; nunca lança.
 */

const INSTANCE = `${hostname()}#${process.env.NODE_APP_INSTANCE ?? process.pid}`
/** Pusher recusa mensagens acima de 10 KB: agrupa em lotes. */
const PUSHER_MAX_BYTES = 9000

export interface EnvironmentLogger {
    info(message: string, data?: unknown): void
    step(message: string, data?: unknown): void
    success(message: string, data?: unknown): void
    warn(message: string, data?: unknown): void
    error(message: string, error?: unknown, data?: unknown): void
}

interface LogContext {
    environmentId: string
    scope?: string
    service?: string | null
    secrets?: readonly string[]
}

function chunkForPusher(lines: EnvironmentLogLine[], maxBytes = PUSHER_MAX_BYTES): EnvironmentLogLine[][] {
    const chunks: EnvironmentLogLine[][] = []
    let current: EnvironmentLogLine[] = []
    let size = 2
    for (const original of lines) {
        let line = original
        let lineSize = Buffer.byteLength(JSON.stringify(line))
        if (lineSize > maxBytes - 100) {
            line = { ...original, data: "[dados omitidos no tempo real — use Atualizar para ver o log completo]" }
            lineSize = Buffer.byteLength(JSON.stringify(line))
        }
        if (current.length > 0 && size + lineSize + 1 > maxBytes) {
            chunks.push(current)
            current = []
            size = 2
        }
        current.push(line)
        size += lineSize + 1
    }
    if (current.length > 0) chunks.push(current)
    return chunks
}

async function persist(line: EnvironmentLogLine): Promise<void> {
    try {
        await dbConnect()
        await EnvironmentLog.create({ ...line, ts: new Date(line.ts) })
    } catch (error) {
        logger.warn({ err: error instanceof Error ? error.message : error }, "[environments] Falha ao gravar log")
    }
}

async function emit(context: LogContext, level: EnvironmentLogLevel, message: string, data: unknown): Promise<void> {
    const secrets = context.secrets ?? []
    const line: EnvironmentLogLine = {
        environmentId: context.environmentId,
        level,
        message: String(maskSensitive(message, secrets)),
        data: data === undefined ? undefined : maskSensitive(data, secrets),
        service: context.service ?? null,
        scope: context.scope,
        ts: new Date().toISOString(),
        instance: INSTANCE,
    }
    const text = formatLogLine({ integrationId: "ambiente", ...line }, { tag: "AMBIENTE" })
    if (level === "error") console.error(text)
    else if (level === "warn") console.warn(text)
    else console.log(text)

    await persist(line)
    for (const chunk of chunkForPusher([line])) await publishEnvironmentLogs(context.environmentId, chunk)
}

const pending = new Set<Promise<void>>()

function fire(context: LogContext, level: EnvironmentLogLevel, message: string, data: unknown): void {
    const task = emit(context, level, message, data).catch(() => undefined)
    pending.add(task)
    void task.finally(() => pending.delete(task))
}

/** Logger de um ambiente (uma operação/escopo). Fire-and-forget: nunca quebra a operação. */
export function environmentLogger(context: LogContext): EnvironmentLogger {
    return {
        info: (message, data) => fire(context, "info", message, data),
        step: (message, data) => fire(context, "step", message, data),
        success: (message, data) => fire(context, "success", message, data),
        warn: (message, data) => fire(context, "warn", message, data),
        error: (message, error, data) =>
            fire(context, "error", message, error === undefined ? data : { error: error instanceof Error ? error.message : error, ...(data ? { context: data } : {}) }),
    }
}

/** Espera os logs em andamento serem gravados (scripts). */
export async function drainEnvironmentLogs(): Promise<void> {
    await Promise.allSettled([...pending])
}

export interface ReadLogsOptions {
    after?: string
    limit?: number
    scope?: string
    service?: string | null
    /** Sem `service` informado, traz todos. `null` explícito = só as linhas sem serviço. */
    filterService?: boolean
}

/** Lê os logs gravados (últimas 48 h), para a carga inicial e o botão "Atualizar". */
export async function readEnvironmentLogs(environmentId: string, options: ReadLogsOptions = {}): Promise<EnvironmentLogLine[]> {
    await dbConnect()
    const filter: Record<string, unknown> = { environmentId }
    if (options.after) filter.ts = { $gt: new Date(options.after) }
    if (options.scope) filter.scope = options.scope
    if (options.filterService) filter.service = options.service ?? null
    const limit = Math.min(Math.max(options.limit ?? 500, 1), 2000)
    const docs = await EnvironmentLog.find(filter).sort({ ts: -1 }).limit(limit).lean()
    return docs
        .reverse()
        .map((doc) => ({
            environmentId: doc.environmentId,
            level: doc.level as EnvironmentLogLevel,
            message: doc.message,
            data: doc.data,
            service: doc.service ?? null,
            scope: doc.scope,
            ts: new Date(doc.ts).toISOString(),
            instance: doc.instance,
        }))
}
