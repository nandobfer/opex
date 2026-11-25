import { appliedEnvironmentLimits, environmentLimitsDiffer, hasAnyLimit, NO_LIMITS, sameEnvironmentLimits, sameLimits, type ResourceLimits } from "./resource-limits"
import { DEFAULT_ENVIRONMENT_LIMITS, type EnvironmentLimits, type LimitMode, type ServiceLimits } from "./schemas"
import type { ComposeServicesDto, EnvironmentDto } from "./types"

/** Regras (puras) do campo "Limites de recursos" do formulário do ambiente (OPE-193). */

const only = (limits: ResourceLimits): ResourceLimits => ({ memoryGb: limits.memoryGb, swapGb: limits.swapGb, cpus: limits.cpus })

/** Serviços do ambiente vistos no host (sem repetição, na ordem do snapshot). */
export const runningServiceNames = (env: Pick<EnvironmentDto, "services">) => [...new Set(env.services.map((service) => service.service))]

/**
 * Editar: os limites configurados (mesmo vazios: "sem limite" salvo continua vazio); nunca configurados, os
 * aplicados hoje no host; sem nenhum, o padrão vazio.
 */
export function initialLimits(env: Pick<EnvironmentDto, "limits" | "limitsConfigured" | "services"> | null): EnvironmentLimits {
    if (!env) return DEFAULT_ENVIRONMENT_LIMITS
    if (env.limitsConfigured) return env.limits
    return appliedEnvironmentLimits(env.services) ?? DEFAULT_ENVIRONMENT_LIMITS
}

/**
 * Troca de modo: para "Por serviço", cada serviço conhecido recebe os valores do modo único; de volta ao
 * modo único, os valores das linhas quando são iguais em todas (senão, vazio).
 */
export function switchLimitMode(current: EnvironmentLimits, mode: LimitMode, services: string[]): EnvironmentLimits {
    if (current.mode === mode) return current
    if (current.mode === "shared") return { mode: "service", services: services.map((service) => ({ service, ...only(current) })) }
    const rows = current.services
    const first = rows[0]
    const shared = first && rows.every((row) => sameLimits(row, first)) ? only(first) : NO_LIMITS
    return { mode: "shared", ...shared }
}

export interface ComposeMerge {
    limits: EnvironmentLimits
    /** Modo único com limites diferentes por serviço no compose (sugere "Por serviço"). */
    differs: boolean
    /** Campos preenchidos com o que o compose declara. */
    filled: boolean
}

/**
 * Resultado do "Ler compose": por serviço, mantém as linhas que existem e acrescenta os serviços novos
 * com os limites declarados no compose; no modo único, preenche os campos vazios quando o compose declara
 * os mesmos limites em todos os serviços.
 */
export function mergeComposeServices(current: EnvironmentLimits, read: ComposeServicesDto): ComposeMerge {
    if (current.mode === "service") {
        const known = new Set(current.services.map((row) => row.service))
        const added: ServiceLimits[] = read.services.filter((service) => !known.has(service.name)).map((service) => ({ service: service.name, ...only(service.declared) }))
        return { limits: { mode: "service", services: [...current.services, ...added] }, differs: false, filled: added.length > 0 }
    }
    const declared = read.services.map((service) => service.declared)
    const first = declared[0]
    if (!first || !declared.some(hasAnyLimit)) return { limits: current, differs: false, filled: false }
    if (!declared.every((item) => sameLimits(item, first))) return { limits: current, differs: true, filled: false }
    const next = {
        mode: "shared" as const,
        memoryGb: current.memoryGb ?? first.memoryGb,
        swapGb: current.swapGb ?? (current.memoryGb === null ? first.swapGb : null),
        cpus: current.cpus ?? first.cpus,
    }
    return { limits: next, differs: false, filled: !sameLimits(next, current) }
}

/** Linhas do modo por serviço que não estão no compose lido (ou no host, antes da leitura). */
export function orphanServices(limits: EnvironmentLimits, known: string[] | null): string[] {
    if (limits.mode !== "service" || !known) return []
    return limits.services.map((row) => row.service).filter((service) => !known.includes(service))
}

/**
 * Falta um Deploy para os limites valerem (ambiente implantado)? Os configurados diferem dos gravados no
 * último deploy (inclusive tirar um limite: salvo vazio x deploy com limite) ou um serviço com limite salvo
 * está com outro aplicado no container.
 */
export function limitsPendingDeploy(env: Pick<EnvironmentDto, "limits" | "limitsConfigured" | "deployedLimits" | "services" | "deployedOn">): boolean {
    if (!env.deployedOn) return false
    if (env.limitsConfigured && !sameEnvironmentLimits(env.limits, env.deployedLimits ?? DEFAULT_ENVIRONMENT_LIMITS)) return true
    return environmentLimitsDiffer(env.limits, env.services)
}
