import { z } from "zod"
import type { EnvironmentLimits } from "./schemas"

/**
 * Limites de RAM, CPU e swap (puro), compartilhados pelo builder do servidor (OPE-186) e pelos ambientes
 * (OPE-193). Vazio (`null`) = sem limite; `swapGb` é o swap **além** da RAM (vazio = padrão do Docker,
 * 0 = sem swap) e exige a RAM.
 */

export const resourceLimitsShape = {
    memoryGb: z.number("Informe um número").min(0.5, "Mínimo de 0,5 GiB").max(4096).nullable(),
    cpus: z.number("Informe um número").min(0.1, "Mínimo de 0,1 CPU").max(512).nullable(),
    swapGb: z.number("Informe um número").min(0, "Use 0 ou mais").max(4096).nullable(),
}

export interface ResourceLimits {
    memoryGb: number | null
    /** Swap além da RAM (`null` = padrão do Docker). */
    swapGb: number | null
    cpus: number | null
}

export const NO_LIMITS: ResourceLimits = { memoryGb: null, swapGb: null, cpus: null }

export const SWAP_NEEDS_MEMORY = "Defina a RAM para limitar o swap"

/** Swap sem RAM é inválido (o Docker não aceita `memory-swap` sem `memory`). */
export function swapNeedsMemory(value: Pick<ResourceLimits, "memoryGb" | "swapGb">, ctx: z.RefinementCtx, path: (string | number)[] = []): void {
    if (value.swapGb !== null && value.memoryGb === null) ctx.addIssue({ code: "custom", path: [...path, "swapGb"], message: SWAP_NEEDS_MEMORY })
}

/** Os campos de limite de um container no `docker inspect` (`HostConfig`). */
export interface LimitsContainerState {
    memoryBytes: number
    memorySwapBytes: number
    nanoCpus: number
    cpuPeriod: number
    cpuQuota: number
}

const GIB = 1024 ** 3
export const round2 = (value: number) => Math.round(value * 100) / 100

/** Limites aplicados no container, nas unidades da configuração (GiB, swap além da RAM, CPUs). */
export function appliedLimits(container: LimitsContainerState): ResourceLimits {
    const memoryGb = container.memoryBytes > 0 ? round2(container.memoryBytes / GIB) : null
    const swapGb = memoryGb !== null && container.memorySwapBytes > container.memoryBytes ? round2((container.memorySwapBytes - container.memoryBytes) / GIB) : null
    const cpus = container.nanoCpus > 0 ? round2(container.nanoCpus / 1e9) : container.cpuQuota > 0 && container.cpuPeriod > 0 ? round2(container.cpuQuota / container.cpuPeriod) : null
    return { memoryGb, swapGb, cpus }
}

const same = (a: number | null, b: number | null) => (a === null ? null : round2(a)) === (b === null ? null : round2(b))

/** Mesmos valores (sem interpretar o swap padrão). */
export const sameLimits = (a: ResourceLimits, b: ResourceLimits) => same(a.memoryGb, b.memoryGb) && same(a.swapGb, b.swapGb) && same(a.cpus, b.cpus)

export const hasAnyLimit = (limits: ResourceLimits) => limits.memoryGb !== null || limits.cpus !== null || limits.swapGb !== null

/**
 * Os limites salvos diferem dos aplicados? Swap salvo vazio (padrão do Docker) aceita o aplicado vazio
 * ou igual à RAM (o padrão do Docker é o dobro da RAM no total).
 */
export function limitsDiffer(config: ResourceLimits, applied: ResourceLimits): boolean {
    if (!same(config.memoryGb, applied.memoryGb) || !same(config.cpus, applied.cpus)) return true
    if (config.memoryGb === null) return false
    if (config.swapGb === null) return !(applied.swapGb === null || same(applied.swapGb, config.memoryGb))
    return !same(config.swapGb, applied.swapGb ?? (config.swapGb === 0 ? 0 : null))
}

const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })

/** "RAM 24 GiB · swap +16 GiB · 6 CPUs" (vazio = sem limite; swap vazio = padrão do Docker). */
export function limitsText(limits: ResourceLimits): string {
    const ram = limits.memoryGb === null ? "RAM sem limite" : `RAM ${number(limits.memoryGb)} GiB`
    const swap = limits.memoryGb === null ? null : limits.swapGb === null ? "swap padrão" : limits.swapGb === 0 ? "sem swap" : `swap +${number(limits.swapGb)} GiB`
    const cpus = limits.cpus === null ? "CPU sem limite" : `${number(limits.cpus)} CPU${limits.cpus === 1 ? "" : "s"}`
    return [ram, swap, cpus].filter(Boolean).join(" · ")
}

/** Texto curto: "sem limite" quando nada está limitado. */
export const shortLimitsText = (limits: ResourceLimits) => (hasAnyLimit(limits) ? limitsText(limits) : "sem limite")

// --- Ambientes (OPE-193) -------------------------------------------------------------------------

/** Limites de um ambiente salvo (documento antigo, sem o campo, = sem limite). */
export const environmentLimitsOf = (saved: EnvironmentLimits | null | undefined): EnvironmentLimits => saved ?? { mode: "shared", ...NO_LIMITS }

const limitsOf = (item: ResourceLimits): ResourceLimits => ({ memoryGb: item.memoryGb, swapGb: item.swapGb, cpus: item.cpus })

/** Algum limite salvo (o vazio deixa o Editar mostrar os aplicados no host)? */
export function hasSavedLimits(limits: EnvironmentLimits): boolean {
    return limits.mode === "shared" ? hasAnyLimit(limits) : limits.services.some(hasAnyLimit)
}

/** Limites que valem para cada serviço do compose (`null` = sem limite). */
export function limitsForService(limits: EnvironmentLimits, service: string): ResourceLimits | null {
    const value = limits.mode === "shared" ? limitsOf(limits) : limits.services.find((item) => item.service === service)
    return value && hasAnyLimit(value) ? limitsOf(value) : null
}

/** Linhas do modo por serviço que não existem no compose. */
export function unknownLimitServices(limits: EnvironmentLimits, services: string[]): string[] {
    return limits.mode === "service" ? limits.services.filter((item) => hasAnyLimit(item) && !services.includes(item.service)).map((item) => item.service) : []
}

/** Serviço com os limites aplicados no container (`null` = não lidos). */
export interface ServiceWithLimits {
    service: string
    limits: ResourceLimits | null
}

/**
 * Limites aplicados hoje nos containers do ambiente, no formato do formulário: `shared` quando todos os
 * serviços têm os mesmos; `service` quando diferem; `null` sem nenhum limite (ou sem container).
 */
export function appliedEnvironmentLimits(services: ServiceWithLimits[]): EnvironmentLimits | null {
    const read = services.filter((item): item is ServiceWithLimits & { limits: ResourceLimits } => item.limits !== null)
    if (!read.length || !read.some((item) => hasAnyLimit(item.limits))) return null
    const first = read[0]!.limits
    if (read.every((item) => sameLimits(item.limits, first))) return { mode: "shared", ...limitsOf(first) }
    const byService = new Map<string, ResourceLimits>()
    for (const item of read) if (!byService.has(item.service)) byService.set(item.service, limitsOf(item.limits))
    return { mode: "service", services: [...byService.entries()].map(([service, limits]) => ({ service, ...limits })) }
}

/**
 * Os salvos diferem dos aplicados em algum container? Só contam os serviços com limite salvo e com os
 * limites lidos: serviço sem limite salvo não ganha chave no override, então o que o próprio compose
 * declara continua valendo e não é divergência.
 */
export function environmentLimitsDiffer(saved: EnvironmentLimits, services: ServiceWithLimits[]): boolean {
    return services.some((item) => {
        const expected = limitsForService(saved, item.service)
        return expected !== null && item.limits !== null && limitsDiffer(expected, item.limits)
    })
}

/** Os mesmos limites efetivos (modo por serviço: só as linhas com algum limite, em qualquer ordem)? */
export function sameEnvironmentLimits(a: EnvironmentLimits, b: EnvironmentLimits): boolean {
    if (a.mode !== b.mode) return !hasSavedLimits(a) && !hasSavedLimits(b)
    if (a.mode === "shared" && b.mode === "shared") return sameLimits(a, b)
    const rows = (limits: EnvironmentLimits) => (limits.mode === "service" ? limits.services.filter(hasAnyLimit) : [])
    const left = rows(a)
    const right = new Map(rows(b).map((row) => [row.service, row]))
    return left.length === right.size && left.every((row) => right.has(row.service) && sameLimits(row, right.get(row.service)!))
}

/** "RAM 4 GiB · swap padrão · 2 CPUs" (modo único) ou "app: …; db: sem limite" (por serviço). */
export function environmentLimitsText(limits: EnvironmentLimits): string {
    if (limits.mode === "shared") return shortLimitsText(limits)
    const rows = limits.services.filter(hasAnyLimit)
    return rows.length ? rows.map((item) => `${item.service}: ${limitsText(item)}`).join("; ") : "sem limite"
}

/** Os aplicados nos containers, por serviço ("app: RAM 4 GiB · …" ou o texto único quando iguais). */
export function appliedLimitsText(services: ServiceWithLimits[]): string | null {
    if (!services.some((item) => item.limits !== null)) return null
    const applied = appliedEnvironmentLimits(services)
    return applied ? environmentLimitsText(applied) : "sem limite"
}
