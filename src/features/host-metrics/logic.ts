import { usageLevel, worstUsageLevel, type UsageLevel } from "@/components/metrics/usage-level"
import { HOST_METRICS_STALE_MARGIN_MS, HOST_METRICS_STALE_MS, SHELL_MARKERS } from "./constants"
import type { HostMetrics, HostMetricsDto, HostUsage } from "./schemas"

/** Regras puras dos recursos do servidor (parser do shell, faixas, pior caso, desatualizado). */

export class InvalidHostMetricsError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "InvalidHostMetricsError"
    }
}

const clampPercent = (value: number) => (Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0)

/** Mesma conta do plugin: total ≤ 0 vira 0 e o percentual fica entre 0 e 100. */
function usage(used: number, total: number): HostUsage {
    const safeTotal = Number.isFinite(total) && total > 0 ? total : 0
    const safeUsed = Number.isFinite(used) && used > 0 ? used : 0
    return { percent: safeTotal > 0 ? clampPercent((safeUsed / safeTotal) * 100) : 0, used: safeUsed, total: safeTotal }
}

/**
 * Limita os percentuais a 0–100 e recusa a leitura com RAM ou disco de total 0 (leitura inválida).
 * Swap com total 0 é válido: o servidor não tem swap.
 */
export function normalizeHostMetrics(metrics: HostMetrics): HostMetrics {
    const fix = (item: HostUsage): HostUsage => ({ percent: clampPercent(item.percent), used: Math.max(0, item.used || 0), total: Math.max(0, item.total || 0) })
    const next = { cpu: fix(metrics.cpu), memory: fix(metrics.memory), swap: fix(metrics.swap), disk: fix(metrics.disk) }
    if (next.memory.total <= 0) throw new InvalidHostMetricsError("Leitura sem o total de memória")
    if (next.disk.total <= 0) throw new InvalidHostMetricsError("Leitura sem o total do disco")
    if (next.swap.total <= 0) next.swap = { percent: 0, used: 0, total: 0 }
    return next
}

function cpuSample(line: string | undefined): { idle: number; total: number } {
    if (!line || !/^cpu\s/.test(line)) throw new InvalidHostMetricsError("Saída de /proc/stat incompleta")
    const fields = line.trim().split(/\s+/).slice(1).map(Number)
    if (fields.length < 4 || fields.some((field) => !Number.isFinite(field))) throw new InvalidHostMetricsError("Saída de /proc/stat incompleta")
    const idle = (fields[3] ?? 0) + (fields[4] ?? 0)
    return { idle, total: fields.reduce((sum, field) => sum + field, 0) }
}

function section(lines: string[], marker: string): string[] {
    const start = lines.indexOf(marker)
    if (start < 0) throw new InvalidHostMetricsError(`Saída do shell sem a parte ${marker}`)
    const rest = lines.slice(start + 1)
    const end = rest.findIndex((line) => line.startsWith("@@"))
    return end < 0 ? rest : rest.slice(0, end)
}

/**
 * Saída do comando de shell (`HOST_METRICS_SHELL_COMMAND`) → medidas, com a mesma conta do plugin
 * opencode-htop (`/proc/stat` em delta, `MemAvailable` com fallback, disco = total − livre p/ usuário).
 */
export function parseShellMetrics(output: string): HostMetrics {
    const lines = output.split("\n").map((line) => line.trim())
    const cpuLines = lines.filter((line) => /^cpu\s/.test(line))
    const before = cpuSample(cpuLines[0])
    const after = cpuSample(cpuLines[1])
    const coresLine = section(lines, SHELL_MARKERS.cores).find(Boolean)
    const cores = Number(coresLine) > 0 ? Number(coresLine) : 1
    const totalDelta = after.total - before.total
    const idleDelta = after.idle - before.idle
    const cpuPercent = totalDelta > 0 ? clampPercent(((totalDelta - idleDelta) / totalDelta) * 100) : 0

    const info: Record<string, number> = {}
    for (const line of section(lines, SHELL_MARKERS.meminfo)) {
        const match = /^([A-Za-z_()]+):\s+(\d+)\s+kB/.exec(line)
        if (match) info[match[1]!] = Number(match[2]) * 1024
    }
    if (!info.MemTotal) throw new InvalidHostMetricsError("Saída de /proc/meminfo incompleta")
    const available = info.MemAvailable ?? (info.MemFree ?? 0) + (info.Buffers ?? 0) + (info.Cached ?? 0)
    const swapTotal = info.SwapTotal ?? 0

    const diskRow = section(lines, SHELL_MARKERS.disk).find((line) => line && !/^Filesystem/i.test(line))
    const diskFields = diskRow?.split(/\s+/) ?? []
    const size = Number(diskFields[1])
    const avail = Number(diskFields[3])
    if (!Number.isFinite(size) || !Number.isFinite(avail) || size <= 0) throw new InvalidHostMetricsError("Saída do df incompleta")

    return normalizeHostMetrics({
        cpu: { percent: cpuPercent, used: (cpuPercent / 100) * cores, total: cores },
        memory: usage(info.MemTotal - available, info.MemTotal),
        swap: usage(swapTotal - (info.SwapFree ?? 0), swapTotal),
        disk: usage(size - avail, size),
    })
}

export const hasSwap = (metrics: HostMetrics) => metrics.swap.total > 0

/** Faixa de cada medida (swap só quando existe). */
export function hostLevels(metrics: HostMetrics): UsageLevel[] {
    const items = [metrics.cpu, metrics.memory, metrics.disk, ...(hasSwap(metrics) ? [metrics.swap] : [])]
    return items.map((item) => usageLevel(item.percent))
}

/** Sem leitura boa dentro do prazo (`staleAfterMs`), ou sem nenhuma. */
export function isHostMetricsStale(dto: Pick<HostMetricsDto, "checkedAt" | "staleAfterMs">, now: number): boolean {
    if (!dto.checkedAt) return true
    return now - new Date(dto.checkedAt).getTime() > dto.staleAfterMs
}

/**
 * Pior faixa entre CPU, RAM, swap (se houver) e disco para a bolinha do servidor; `null` (cinza)
 * sem dado confiável: carregando, erro, sem configuração ou desatualizado.
 */
export function hostMetricsLevel(dto: HostMetricsDto | undefined | null, now: number): UsageLevel | null {
    if (!dto || dto.state !== "ok" || !dto.metrics || isHostMetricsStale(dto, now)) return null
    return worstUsageLevel(hostLevels(dto.metrics))
}

/** Prazo do "desatualizado": 30 s ou `2 × intervalo + 5 s` da rotina, o que for maior (sem rotina, 30 s). */
export function staleAfterMsFor(intervalMs: number | null): number {
    if (!intervalMs || intervalMs <= 0) return HOST_METRICS_STALE_MS
    return Math.max(HOST_METRICS_STALE_MS, 2 * intervalMs + HOST_METRICS_STALE_MARGIN_MS)
}

/** Assinatura do que a tela mostra (percentuais arredondados e estado): muda → evento em tempo real. */
export function hostMetricsHash(dto: HostMetricsDto): string {
    const m = dto.metrics
    return JSON.stringify([dto.state, dto.message, dto.staleAfterMs, m ? [m.cpu, m.memory, m.swap, m.disk].map((item) => Math.round(item.percent)) : null])
}

const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const GB = 1e9

/** Bytes em GB com 1 casa, ou TB a partir de 1.000 GB (pt-BR). */
export function formatBytes(bytes: number): string {
    const gb = bytes / GB
    if (gb >= 1000) return `${decimal.format(gb / 1000)} TB`
    return `${decimal.format(gb)} GB`
}
