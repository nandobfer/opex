import { hostname } from "os"
import { chunkForPusher } from "@/lib/integrations/debug"
import { maskSensitive, type IntegrationLogLevel, type IntegrationLogLine } from "@/lib/integrations/log-format"
import { pluginDebugChannel } from "@/lib/pusher/channel-names"
import { loggerFor } from "@/lib/logger"
import { PLUGIN_DEBUG_EVENT, type PluginChannel } from "../constants"

/**
 * Logs de debug dos plugins (OPE-172), no formato das integrações (`IntegrationLogLine`):
 *  1. vão para o console do servidor (Pino, `module: plugin`);
 *  2. são gravados em `plugin_logs` (48 h) — o que o "Atualizar" lê;
 *  3. saem pelo Pusher em `private-plugin-{id}` (`plugin-debug`), agrupados a cada 500 ms.
 * Plugin não tem "modo debug": o log é sempre gravado. Chaves sensíveis são mascaradas antes de
 * qualquer destino. Tudo é fire-and-forget: log nunca quebra nem atrasa o plugin.
 */

const INSTANCE = `${hostname()}#${process.env.NODE_APP_INSTANCE ?? process.pid}`
const FLUSH_MS = 500
/** Erro de interface vindo do navegador: mensagem + pilha até 4 KB. */
export const PLUGIN_CLIENT_ERROR_MAX = 4096

export interface PluginLogLine extends IntegrationLogLine {
    channel?: PluginChannel | null
}

const buffers = new Map<string, PluginLogLine[]>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const pending = new Set<Promise<void>>()

async function flush(pluginId: string): Promise<void> {
    timers.delete(pluginId)
    const lines = buffers.get(pluginId) ?? []
    buffers.delete(pluginId)
    if (!lines.length) return
    try {
        const { getRawPusherServer } = await import("@/lib/pusher/server")
        const client = await getRawPusherServer()
        for (const chunk of chunkForPusher(lines)) await client.trigger(pluginDebugChannel(pluginId), PLUGIN_DEBUG_EVENT, { entries: chunk })
    } catch {
        // Pusher indisponível: o log continua no console e no Mongo.
    }
}

function enqueue(pluginId: string, line: PluginLogLine): void {
    const list = buffers.get(pluginId) ?? []
    list.push(line)
    buffers.set(pluginId, list)
    if (!timers.has(pluginId)) {
        const timer = setTimeout(() => void flush(pluginId), FLUSH_MS)
        timer.unref?.()
        timers.set(pluginId, timer)
    }
}

async function emit(pluginId: string, level: IntegrationLogLevel, message: string, data: unknown, channel: PluginChannel | null): Promise<void> {
    const line: PluginLogLine = {
        integrationId: `plugin:${pluginId}`,
        level,
        message: String(maskSensitive(message)),
        ...(data === undefined ? {} : { data: maskSensitive(data) }),
        ts: new Date().toISOString(),
        instance: INSTANCE,
        channel,
    }
    const pino = loggerFor({ module: "plugin", plugin: pluginId, channel })
    const pinoLevel = level === "error" ? "error" : level === "warn" ? "warn" : "info"
    pino[pinoLevel](line.data === undefined ? {} : { data: line.data }, line.message)
    try {
        const { dbConnect } = await import("@/lib/db")
        await dbConnect()
        const { PluginLog } = await import("@/lib/db/models/PluginLog")
        await PluginLog.create({ pluginId, channel, level, message: line.message, data: line.data, ts: new Date(line.ts), instance: INSTANCE })
    } catch (error) {
        pino.warn({ err: error instanceof Error ? error.message : error }, "[plugins] Falha ao gravar log de debug")
    }
    enqueue(pluginId, line)
}

/** Grava uma linha de log do plugin (sem esperar). */
export function pluginLog(pluginId: string, level: IntegrationLogLevel, message: string, data?: unknown, channel: PluginChannel | null = null): void {
    const task = emit(pluginId, level, message, data, channel).catch(() => undefined)
    pending.add(task)
    void task.finally(() => pending.delete(task))
}

/** Espera as gravações pendentes (testes). */
export async function drainPluginLogs(): Promise<void> {
    await Promise.all([...pending])
}

/** Linhas gravadas do plugin, da mais antiga para a mais nova (`after`: só as depois dessa data). */
export async function listPluginLogs(pluginId: string, options: { after?: string; limit?: number } = {}): Promise<PluginLogLine[]> {
    const { dbConnect } = await import("@/lib/db")
    await dbConnect()
    const { PluginLog } = await import("@/lib/db/models/PluginLog")
    const limit = Math.min(Math.max(options.limit ?? 500, 1), 1000)
    const query: Record<string, unknown> = { pluginId }
    if (options.after) {
        const after = new Date(options.after)
        if (!Number.isNaN(after.getTime())) query.ts = { $gt: after }
    }
    const docs = await PluginLog.find(query).sort({ ts: -1 }).limit(limit).lean()
    return docs.reverse().map((doc) => ({
        integrationId: `plugin:${pluginId}`,
        level: doc.level,
        message: doc.message,
        ...(doc.data === undefined ? {} : { data: doc.data }),
        ts: new Date(doc.ts).toISOString(),
        ...(doc.instance ? { instance: doc.instance } : {}),
        channel: doc.channel ?? null,
    }))
}

/** Erro de interface pego pela fronteira do plugin no navegador, limitado a 4 KB. */
export function recordPluginClientError(pluginId: string, input: { message: string; stack?: string | null; channel: PluginChannel | null; where: string }): void {
    const clip = (value: string) => (value.length > PLUGIN_CLIENT_ERROR_MAX ? `${value.slice(0, PLUGIN_CLIENT_ERROR_MAX)}…` : value)
    pluginLog(pluginId, "error", `[interface] ${clip(input.message)}`, { where: clip(input.where), ...(input.stack ? { stack: clip(input.stack) } : {}) }, input.channel)
}
