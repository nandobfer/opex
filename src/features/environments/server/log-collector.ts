import { hostname } from "os"
import { logger } from "@/lib/logger"
import { maskSensitive } from "@/lib/integrations/log-format"
import { LOG_COLLECTOR_INTERVAL_MS, LOG_SESSION_TTL_MS } from "../constants"
import type { EnvironmentLogLine } from "../types"
import { fetchContainerLogs, listHostContainers } from "./docker"
import { persistEnvironmentLogLines } from "./logs"
import { publishEnvironmentLogs } from "./realtime"
import { effectiveProjectName, loadEnvironmentRuntime, type EnvironmentRuntime } from "./context"

/**
 * Coletor de logs **ao vivo** dos containers de um ambiente. Enquanto houver leitura da aba Logs, o
 * coletor busca `docker logs` de cada container do projeto Compose efetivo, grava as linhas
 * (retenção de 48 h) e publica no canal do ambiente. Sem leitores por `LOG_SESSION_TTL_MS`, para
 * sozinho. Funciona também para um projeto **adotado** (sem o compose do Opex).
 *
 * Um coletor por ambiente, compartilhado entre espectadores (dono e portal).
 */

const INSTANCE = `${hostname()}#${process.pid}`
/** Linhas repetidas idênticas (mesmo ts/texto) são descartadas. */
const DEDUP_WINDOW = 400

interface Collector {
    timer: NodeJS.Timeout
    lastAccess: number
    /** Último `ts` visto por container (cursor do `--since`). */
    since: Map<string, string>
    seen: Set<string>
}

const collectors = new Map<string, Collector>()

function lineKey(container: string, ts: string | null, text: string): string {
    return `${container}|${ts ?? ""}|${text}`
}

async function collectOnce(envId: string, collector: Collector): Promise<void> {
    const runtime: EnvironmentRuntime = await loadEnvironmentRuntime(envId)
    const projectName = effectiveProjectName(runtime)
    const containers = (await listHostContainers(runtime.host, { cwd: runtime.directory })).filter((container) => container.project === projectName)
    if (containers.length === 0) return
    const secrets = runtime.secrets
    const batch: EnvironmentLogLine[] = []
    for (const container of containers) {
        const since = collector.since.get(container.name)
        const lines = await fetchContainerLogs(runtime.host, container.name, {
            cwd: runtime.directory,
            ...(since ? { since } : { tail: 200 }),
        })
        let lastTs = since ?? null
        for (const line of lines) {
            const key = lineKey(container.name, line.ts, line.text)
            if (collector.seen.has(key)) continue
            collector.seen.add(key)
            if (collector.seen.size > DEDUP_WINDOW) {
                const first = collector.seen.values().next().value
                if (first !== undefined) collector.seen.delete(first)
            }
            if (line.ts && (!lastTs || line.ts > lastTs)) lastTs = line.ts
            batch.push({
                environmentId: envId,
                level: "info",
                message: String(maskSensitive(line.text, secrets)),
                service: container.service,
                scope: "logs",
                ts: line.ts ?? new Date().toISOString(),
                instance: INSTANCE,
            })
        }
        if (lastTs) collector.since.set(container.name, lastTs)
    }
    if (batch.length === 0) return
    await persistEnvironmentLogLines(batch)
    for (let index = 0; index < batch.length; index += 40) {
        await publishEnvironmentLogs(envId, batch.slice(index, index + 40))
    }
}

/** Mantém o coletor do ambiente vivo por mais uma janela (chamado a cada leitura da aba Logs). */
export function ensureEnvironmentLogCollector(envId: string): void {
    const existing = collectors.get(envId)
    if (existing) {
        existing.lastAccess = Date.now()
        return
    }
    const collector: Collector = { timer: setTimeout(() => undefined, 0), lastAccess: Date.now(), since: new Map(), seen: new Set() }
    clearTimeout(collector.timer)
    const tick = () => {
        if (Date.now() - collector.lastAccess > LOG_SESSION_TTL_MS) {
            clearInterval(collector.timer)
            collectors.delete(envId)
            return
        }
        void collectOnce(envId, collector).catch((error) => logger.debug({ err: error instanceof Error ? error.message : error, envId }, "[environments] Coletor de logs falhou"))
    }
    collector.timer = setInterval(tick, LOG_COLLECTOR_INTERVAL_MS)
    collector.timer.unref?.()
    collectors.set(envId, collector)
    void collectOnce(envId, collector).catch(() => undefined)
}

/** Para o coletor de um ambiente (ex.: ao excluir o ambiente). */
export function stopEnvironmentLogCollector(envId: string): void {
    const collector = collectors.get(envId)
    if (!collector) return
    clearInterval(collector.timer)
    collectors.delete(envId)
}
