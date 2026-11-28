import type { ResourceLimits } from "./resource-limits"
import type { Machine } from "./schemas"

/**
 * Uso de CPU, RAM, swap e disco dos containers e do ambiente (OPE-211, puro). O % é sobre o limite
 * aplicado no container; sem limite, sobre a capacidade da máquina onde ele roda.
 */

/** Uso lido de um container (o que o snapshot e a leitura de disco trazem). */
export interface ContainerUsageDto {
    /** `CPUPerc` do `docker stats` (vai até N×100% numa máquina com N CPUs). */
    cpuPercent: number | null
    memoryBytes: number | null
    swapBytes: number | null
    /** Camada gravável + volumes nomeados montados (`null` = ainda não lido). */
    diskBytes: number | null
    /** Volumes nomeados montados (o total do ambiente conta cada um uma vez só). */
    volumes: { name: string; bytes: number }[]
    /** Quando o disco foi lido. */
    diskCheckedAt: string | null
}

export const EMPTY_USAGE: ContainerUsageDto = { cpuPercent: null, memoryBytes: null, swapBytes: null, diskBytes: null, volumes: [], diskCheckedAt: null }

/** Capacidade da máquina (snapshot): CPUs, RAM, swap total e o disco onde o Docker guarda os dados. */
export interface MachineCapacity {
    cpus: number
    memoryGb: number
    swapGb?: number | null
    disk?: { totalBytes: number; usedBytes: number } | null
}

export type UsageBase = "limit" | "machine"
export type UsageMetric = "cpu" | "memory" | "swap" | "disk"

export interface UsageValue {
    percent: number
    used: number
    total: number
    base: UsageBase
}

/** Uma métrica: o valor, ou por que não há barra. */
export type UsageCell = { kind: "value"; value: UsageValue } | { kind: "empty"; reason: "no-swap" | "unread" | "reading" | "stopped" }

export type UsageSet = Record<UsageMetric, UsageCell>

const GIB = 1024 ** 3
const UNITS: Record<string, number> = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: GIB, tib: 1024 ** 4 }

/** "120MiB", "1.5GB", "512kB", "0B" (formatos do Docker) em bytes; `null` quando não dá para ler. */
export function parseDockerBytes(text: string | null | undefined): number | null {
    const match = text?.trim().match(/^([\d.,]+)\s*([a-zA-Z]*)$/)
    if (!match) return null
    const value = Number(match[1]!.replace(",", "."))
    const unit = UNITS[(match[2] || "b").toLowerCase()]
    return Number.isFinite(value) && unit ? Math.round(value * unit) : null
}

/** "1.25%" em número. */
export const parsePercent = (text: string | null | undefined): number | null => {
    const value = Number(text?.trim().replace("%", ""))
    return text && Number.isFinite(value) ? value : null
}

/** Bytes usados da RAM no `MemUsage` do `docker stats` ("120MiB / 2GiB"). */
export const memoryUsedBytes = (memUsage: string | null | undefined) => parseDockerBytes(memUsage?.split("/")[0])

const clamp = (value: number) => Math.min(100, Math.max(0, value))
const value = (used: number, total: number, base: UsageBase): UsageCell => ({ kind: "value", value: { percent: total > 0 ? clamp((used / total) * 100) : 0, used, total, base } })

/** Um container: o uso e os limites aplicados. */
export interface UsageInput {
    running: boolean
    usage: ContainerUsageDto
    limits: ResourceLimits | null
}

function cpuCell(input: UsageInput, host: MachineCapacity | null): UsageCell {
    if (!input.running) return { kind: "empty", reason: "stopped" }
    if (input.usage.cpuPercent === null) return { kind: "empty", reason: "unread" }
    const limit = input.limits?.cpus ?? null
    const cpus = limit ?? host?.cpus ?? null
    if (!cpus) return { kind: "empty", reason: "unread" }
    return value(input.usage.cpuPercent / 100, cpus, limit !== null ? "limit" : "machine")
}

function memoryCell(input: UsageInput, host: MachineCapacity | null): UsageCell {
    if (!input.running) return { kind: "empty", reason: "stopped" }
    if (input.usage.memoryBytes === null) return { kind: "empty", reason: "unread" }
    const limit = input.limits?.memoryGb ?? null
    const total = limit !== null ? limit * GIB : host ? host.memoryGb * GIB : null
    if (!total) return { kind: "empty", reason: "unread" }
    return value(input.usage.memoryBytes, total, limit !== null ? "limit" : "machine")
}

function swapCell(input: UsageInput, host: MachineCapacity | null): UsageCell {
    if (!input.running) return { kind: "empty", reason: "stopped" }
    const limit = input.limits?.swapGb ?? null
    if (limit === 0 || (limit === null && host?.swapGb === 0)) return { kind: "empty", reason: "no-swap" }
    if (input.usage.swapBytes === null) return { kind: "empty", reason: "unread" }
    const total = limit !== null ? limit * GIB : host?.swapGb ? host.swapGb * GIB : null
    if (!total) return { kind: "empty", reason: "unread" }
    return value(input.usage.swapBytes, total, limit !== null ? "limit" : "machine")
}

function diskCell(diskBytes: number | null, checked: boolean, host: MachineCapacity | null): UsageCell {
    if (diskBytes === null) return { kind: "empty", reason: checked ? "unread" : "reading" }
    if (!host?.disk?.totalBytes) return { kind: "empty", reason: "unread" }
    return value(diskBytes, host.disk.totalBytes, "machine")
}

/** As quatro métricas de um container. */
export function containerUsage(input: UsageInput, host: MachineCapacity | null): UsageSet {
    return { cpu: cpuCell(input, host), memory: memoryCell(input, host), swap: swapCell(input, host), disk: diskCell(input.usage.diskBytes, input.usage.diskCheckedAt !== null, host) }
}

/** Soma de uma métrica; a base é a soma dos limites quando todos os containers têm limite, senão a máquina. */
function sumCell(cells: UsageCell[]): UsageCell {
    const values = cells.flatMap((cell) => (cell.kind === "value" ? [cell.value] : []))
    if (!values.length) {
        if (cells.length && cells.every((cell) => cell.kind === "empty" && cell.reason === "no-swap")) return { kind: "empty", reason: "no-swap" }
        if (cells.some((cell) => cell.kind === "empty" && cell.reason === "reading")) return { kind: "empty", reason: "reading" }
        return { kind: "empty", reason: cells.length && cells.every((cell) => cell.kind === "empty" && cell.reason === "stopped") ? "stopped" : "unread" }
    }
    const used = values.reduce((total, item) => total + item.used, 0)
    if (values.every((item) => item.base === "limit") && values.length === cells.filter((cell) => !(cell.kind === "empty" && cell.reason === "stopped")).length) {
        return value(used, values.reduce((total, item) => total + item.total, 0), "limit")
    }
    const machine = values.find((item) => item.base === "machine")
    return machine ? value(used, machine.total, "machine") : { kind: "empty", reason: "unread" }
}

/** Total do ambiente: a soma dos containers (o disco conta uma vez só cada volume compartilhado). */
export function environmentUsage(inputs: UsageInput[], host: MachineCapacity | null): UsageSet {
    const sets = inputs.map((input) => containerUsage(input, host))
    const machineFor = (metric: Exclude<UsageMetric, "disk">) => sets.map((set) => set[metric])
    const seen = new Set<string>()
    let disk: number | null = null
    let unread = false
    for (const input of inputs) {
        if (input.usage.diskBytes === null) {
            unread = true
            continue
        }
        const own = input.usage.diskBytes - input.usage.volumes.reduce((total, item) => total + item.bytes, 0)
        const shared = input.usage.volumes.filter((item) => !seen.has(item.name)).reduce((total, item) => total + item.bytes, 0)
        input.usage.volumes.forEach((item) => seen.add(item.name))
        disk = (disk ?? 0) + Math.max(0, own) + shared
    }
    const checked = inputs.some((input) => input.usage.diskCheckedAt !== null)
    return { cpu: sumCell(machineFor("cpu")), memory: sumCell(machineFor("memory")), swap: sumCell(machineFor("swap")), disk: unread && disk === null ? diskCell(null, checked, host) : diskCell(disk, true, host) }
}

/** Bytes em texto curto pt-BR (B, KiB, MiB, GiB, TiB). */
export function formatUsageBytes(bytes: number): string {
    const units = ["B", "KiB", "MiB", "GiB", "TiB"]
    let amount = bytes
    let unit = 0
    while (amount >= 1024 && unit < units.length - 1) {
        amount /= 1024
        unit++
    }
    const digits = unit === 0 || amount >= 100 ? 0 : 1
    return `${amount.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: 0 })} ${units[unit]}`
}

const MACHINE_WORD: Record<Machine, string> = { server: "servidor", pc: "PC" }
const cpuText = (amount: number) => amount.toLocaleString("pt-BR", { maximumFractionDigits: 2 })

/** Detalhe da barra: "300 MiB de 1 GiB (limite)", "1,2 de 8 CPUs (servidor)". */
export function usageDetail(metric: UsageMetric, item: UsageValue, machine: Machine): string {
    const base = item.base === "limit" ? "limite" : MACHINE_WORD[machine]
    if (metric === "cpu") return `${cpuText(item.used)} de ${cpuText(item.total)} CPU${item.total === 1 ? "" : "s"} (${base})`
    return `${formatUsageBytes(item.used)} de ${formatUsageBytes(item.total)} (${base})`
}

export const USAGE_METRICS: { metric: UsageMetric; label: string }[] = [
    { metric: "cpu", label: "CPU" },
    { metric: "memory", label: "RAM" },
    { metric: "swap", label: "Swap" },
    { metric: "disk", label: "Disco" },
]

export const USAGE_EMPTY_TEXT: Record<Extract<UsageCell, { kind: "empty" }>["reason"], string> = { "no-swap": "Sem swap", unread: "não lido", reading: "lendo…", stopped: "parado" }
