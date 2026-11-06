import { getIntegrationConfig } from "@/lib/integrations/config"
import { HOST_METRICS_JOB_ID } from "@/lib/integrations/catalog"
import { integrationDebug } from "@/lib/integrations/debug"
import { intervalMs } from "@/lib/integrations/schedule"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import {
    HOST_METRICS_DEFAULT_INTERVAL_MS,
    HOST_METRICS_HEARTBEAT_MS,
    HOST_METRICS_MESSAGES,
    HOST_METRICS_READ_DEADLINE_MS,
    HOST_METRICS_STEP_DEADLINES_MS,
    HOST_METRICS_UPDATED_EVENT,
    HTOP_PLUGIN_CACHE_MS,
} from "../constants"
import { hostMetricsHash, normalizeHostMetrics, parseShellMetrics, staleAfterMsFor } from "../logic"
import { hostMetricsSchema, type HostMetrics, type HostMetricsDto, type HostMetricsSource } from "../schemas"
import { callHtopRpc, detectHtopPlugin, type HtopPluginDetector, type HtopRpcCaller } from "./rpc"
import { readHostMetricsShell, type HostMetricsShellReader } from "./shell"

/**
 * Recursos da máquina do OpenCode: RPC `opencode-htop.stats` (detectado por `plugin.list()`, em cache
 * por 60 s) e, sem o plugin ou com o RPC falhando, o shell do OpenCode com o parser puro. Leituras
 * simultâneas usam uma chamada só; o último resultado fica em memória. Publica `host-metrics-updated`
 * (o DTO inteiro) quando o que a tela mostra muda ou, sem mudança, pelo menos a cada 20 s.
 */

const log = loggerFor({ feature: "host-metrics" })
const debug = integrationDebug("ai_opencode")
const SOURCE_LABELS: Record<HostMetricsSource, string> = { plugin: "RPC do plugin opencode-htop", shell: "shell do OpenCode" }

export interface HostMetricsDeps {
    detect: HtopPluginDetector
    rpc: HtopRpcCaller
    shell: HostMetricsShellReader
    now: () => number
    /** Prazos das etapas e da leitura inteira (testes encurtam). */
    deadlines: { detect: number; rpc: number; shell: number; read: number }
}

const defaultDeps: HostMetricsDeps = {
    detect: detectHtopPlugin,
    rpc: callHtopRpc,
    shell: readHostMetricsShell,
    now: () => Date.now(),
    deadlines: { ...HOST_METRICS_STEP_DEADLINES_MS, read: HOST_METRICS_READ_DEADLINE_MS },
}

export class HostMetricsTimeoutError extends Error {
    constructor(step: string, ms: number) {
        super(`${step} não respondeu em ${ms} ms`)
        this.name = "HostMetricsTimeoutError"
    }
}

/** Rejeita se a promessa não terminar no prazo: uma chamada pendurada nunca prende o single-flight. */
function withDeadline<T>(promise: Promise<T>, ms: number, step: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HostMetricsTimeoutError(step, ms)), ms)
        timer.unref?.()
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
let deps: HostMetricsDeps = defaultDeps

interface HostMetricsStore {
    snapshot: HostMetricsDto | null
    hash: string | null
    lastPublishedAt: number
    pending: Promise<HostMetricsDto> | null
    /** Detecção do plugin em cache (`available` e quando foi decidido). */
    plugin: { available: boolean; at: number } | null
    source: HostMetricsSource | null
}

const globalStore = globalThis as typeof globalThis & { __hostMetrics?: HostMetricsStore }
const store = (): HostMetricsStore => (globalStore.__hostMetrics ??= { snapshot: null, hash: null, lastPublishedAt: 0, pending: null, plugin: null, source: null })

/** Somente testes: troca as dependências (e zera a memória). */
export function setHostMetricsDepsForTests(next: Partial<HostMetricsDeps> | null): void {
    deps = next ? { ...defaultDeps, ...next } : defaultDeps
    globalStore.__hostMetrics = undefined
}

async function pluginAvailable(state: HostMetricsStore): Promise<boolean> {
    const now = deps.now()
    if (state.plugin && now - state.plugin.at < HTOP_PLUGIN_CACHE_MS) return state.plugin.available
    const available = await withDeadline(deps.detect(), deps.deadlines.detect, "plugin.list").catch((error: unknown) => {
        log.debug({ err: error }, "plugin.list falhou; usando o shell")
        return false
    })
    state.plugin = { available, at: now }
    return available
}

async function readFromPlugin(state: HostMetricsStore): Promise<HostMetrics | null> {
    if (!(await pluginAvailable(state))) return null
    try {
        const parsed = hostMetricsSchema.safeParse(await withDeadline(deps.rpc(), deps.deadlines.rpc, "RPC opencode-htop.stats"))
        if (!parsed.success) throw new Error("Resposta do opencode-htop não reconhecida")
        return normalizeHostMetrics(parsed.data)
    } catch (error) {
        // Falha no uso: cai para o shell até a detecção expirar (plugin reinstalado volta sozinho).
        log.warn({ err: error }, "RPC do opencode-htop falhou; usando o shell")
        state.plugin = { available: false, at: deps.now() }
        return null
    }
}

/** Intervalo da rotina (ligada com o agendador ativo); `null` sem rotina. */
async function currentIntervalMs(): Promise<number | null> {
    const crons = await getIntegrationConfig("crons").catch(() => null)
    const job = crons?.jobs.find((item) => item.id === HOST_METRICS_JOB_ID)
    if (!crons?.schedulerEnabled || !job?.enabled) return null
    return intervalMs(job.schedule)
}

/**
 * Folga do heartbeat: as leituras chegam a cada intervalo ± a duração da leitura, então publicar com
 * `>= 20 s` exatos perderia o heartbeat por milissegundos e o próximo sairia só 30 s depois (no limite
 * do "desatualizado"). Publica quando passaram `20 s − intervalo/2` (no mínimo 0).
 */
export function heartbeatThresholdMs(interval: number | null): number {
    return Math.max(0, HOST_METRICS_HEARTBEAT_MS - (interval ?? HOST_METRICS_DEFAULT_INTERVAL_MS) / 2)
}

async function readMetrics(state: HostMetricsStore): Promise<{ metrics: HostMetrics; source: HostMetricsSource } | { failure: Exclude<HostMetricsDto["state"], "ok"> }> {
    const config = await getIntegrationConfig("ai_opencode")
    if (!config.baseUrl?.trim()) return { failure: "unconfigured" }
    const fromPlugin = await readFromPlugin(state)
    if (fromPlugin) return { metrics: fromPlugin, source: "plugin" }
    try {
        return { metrics: parseShellMetrics(await withDeadline(deps.shell(), deps.deadlines.shell, "Shell do OpenCode")), source: "shell" }
    } catch (error) {
        log.warn({ err: error }, "falha ao ler os recursos do servidor pelo shell")
        return { failure: "error" }
    }
}

async function applyRead(): Promise<HostMetricsDto> {
    const state = store()
    const [read, interval] = await Promise.all([
        withDeadline(readMetrics(state), deps.deadlines.read, "Leitura dos recursos do servidor").catch((error: unknown) => {
            log.warn({ err: error }, "leitura dos recursos do servidor estourou o prazo")
            return { failure: "error" as const }
        }),
        currentIntervalMs(),
    ])
    const staleAfterMs = staleAfterMsFor(interval)
    const attemptedAt = new Date(deps.now()).toISOString()
    const previous = state.snapshot
    let dto: HostMetricsDto
    if ("metrics" in read) {
        if (read.source !== state.source) {
            debug.info(`Recursos do servidor lidos pelo ${SOURCE_LABELS[read.source]}`)
            state.source = read.source
        }
        dto = { state: "ok", message: null, metrics: read.metrics, checkedAt: attemptedAt, attemptedAt, staleAfterMs }
    } else {
        // Falha com leitura anterior: mantém os números e o instante da última leitura boa.
        dto = { state: read.failure, message: HOST_METRICS_MESSAGES[read.failure], metrics: previous?.metrics ?? null, checkedAt: previous?.checkedAt ?? null, attemptedAt, staleAfterMs }
    }
    const hash = hostMetricsHash(dto)
    const changed = hash !== state.hash
    if (changed && dto.state !== previous?.state) {
        if (dto.state === "ok") debug.info("Recursos do servidor: leitura ok")
        else debug.warn(`Recursos do servidor: ${dto.message}`)
    }
    state.snapshot = dto
    state.hash = hash
    const now = deps.now()
    if (changed || now - state.lastPublishedAt >= heartbeatThresholdMs(interval)) {
        state.lastPublishedAt = now
        await publishAppEvent(HOST_METRICS_UPDATED_EVENT, dto).catch(() => undefined)
    }
    return dto
}

/** Lê os recursos agora (rotina e botão "Atualizar"); leituras simultâneas usam uma chamada só. */
export function refreshHostMetrics(): Promise<HostMetricsDto> {
    const state = store()
    if (state.pending) return state.pending
    const next = applyRead().finally(() => {
        if (state.pending === next) state.pending = null
    })
    state.pending = next
    return next
}

/** Último resultado em memória; sem nenhum ainda (ex.: após reiniciar), lê na hora. */
export async function getHostMetrics(): Promise<HostMetricsDto> {
    return store().snapshot ?? refreshHostMetrics()
}

/** Rotina `host-metrics-refresh`. */
export async function runHostMetricsRefresh(): Promise<string> {
    const dto = await refreshHostMetrics()
    if (dto.state !== "ok" || !dto.metrics) return dto.message ?? dto.state
    const m = dto.metrics
    return `CPU ${Math.round(m.cpu.percent)}%, RAM ${Math.round(m.memory.percent)}%, swap ${Math.round(m.swap.percent)}%, disco ${Math.round(m.disk.percent)}%`
}
