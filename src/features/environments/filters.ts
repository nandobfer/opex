import { urlFilterCodecs, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { MACHINES, type Machine } from "./schemas"
import type { EnvironmentDto, UnmanagedProjectDto } from "./types"
import { healthOf, type EnvironmentHealth } from "./view"

/** Filtros da lista `/ambientes` (OPE-211, na URL). Módulo PURO, separado de qualquer schema da API. */

export const ENVIRONMENT_HEALTHS = ["running", "partial", "stopped", "never"] as const satisfies readonly EnvironmentHealth[]
export const ENVIRONMENT_ORIGINS = ["central", "managed", "adopted", "unmanaged"] as const
export type EnvironmentOrigin = (typeof ENVIRONMENT_ORIGINS)[number]

export const ORIGIN_LABELS: Record<EnvironmentOrigin, string> = { central: "Central", managed: "Gerenciado", adopted: "Adotado", unmanaged: "Não gerenciado" }

export interface EnvironmentFilters {
    q: string
    machines: Machine[]
    healths: EnvironmentHealth[]
    origins: EnvironmentOrigin[]
}

export const DEFAULT_ENVIRONMENT_FILTERS: EnvironmentFilters = { q: "", machines: [], healths: [], origins: [] }

export const ENVIRONMENT_FILTER_SCHEMA: UrlFilterSchema<EnvironmentFilters> = {
    q: urlFilterCodecs.string(),
    machines: urlFilterCodecs.strings<Machine>(MACHINES),
    healths: urlFilterCodecs.strings<EnvironmentHealth>(ENVIRONMENT_HEALTHS),
    origins: urlFilterCodecs.strings<EnvironmentOrigin>(ENVIRONMENT_ORIGINS),
}

/** Há algum filtro ativo (o vazio da lista diz "com estes filtros"). */
export const hasActiveEnvironmentFilters = (filters: EnvironmentFilters) => Boolean(filters.q.trim() || filters.machines.length || filters.healths.length || filters.origins.length)

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

/** Termo numérico ("3000", ":4100"): casa por igualdade com uma porta, nunca por pedaço (3000 ≠ 30001). */
const portTerm = (term: string): number | null => {
    const match = term.match(/^:?(\d{1,5})$/)
    return match ? Number(match[1]) : null
}

interface Searchable {
    texts: string[]
    ports: number[]
}

function envSearchable(env: EnvironmentDto): Searchable {
    const source = env.source
    const texts = [env.name, env.slug, source.projectName, ...env.services.map((item) => item.service), ...env.services.map((item) => item.container)]
    if (source.kind === "central") texts.push(source.ref, source.composeFile, ...source.services)
    if (source.kind === "adopted") texts.push(source.workingDir, ...source.configFiles)
    if (source.kind === "managed") texts.push(...source.services)
    const ports = [...env.ports, ...env.services.flatMap((item) => (item.listen ?? []).flatMap((port) => (port.published ? [port.container, port.published] : [port.container])))]
    return { texts, ports }
}

const unmanagedSearchable = (project: UnmanagedProjectDto): Searchable => ({ texts: [project.projectName, project.workingDir ?? "", ...project.configFiles, ...(project.services ?? [])], ports: project.ports ?? [] })

function matches(item: Searchable, rawTerm: string): boolean {
    const term = normalize(rawTerm.trim())
    if (!term) return true
    const port = portTerm(term)
    if (port !== null) return item.ports.includes(port)
    return item.texts.some((text) => normalize(text).includes(term))
}

const unmanagedHealth = (project: UnmanagedProjectDto): EnvironmentHealth => (!project.running ? "stopped" : project.running === project.containers ? "running" : "partial")

/**
 * Aplica a busca (nome, slug, projeto, serviços, containers, pasta, ref; termo numérico = porta exata), a
 * máquina, a situação e a origem: E entre os filtros, OU dentro de cada um. "Não gerenciado" vale para a
 * lista dos não gerenciados; as outras origens, para os ambientes.
 */
export function filterEnvironmentList(list: { items: readonly EnvironmentDto[]; unmanaged: readonly UnmanagedProjectDto[] }, filters: EnvironmentFilters): { items: EnvironmentDto[]; unmanaged: UnmanagedProjectDto[] } {
    const origins = new Set(filters.origins)
    const managedOrigins = filters.origins.filter((origin) => origin !== "unmanaged")
    const items = list.items.filter((env) => {
        if (origins.size && !managedOrigins.includes(env.source.kind)) return false
        if (filters.machines.length && !filters.machines.includes(env.deployedOn?.runOn ?? env.runOn)) return false
        if (filters.healths.length && !filters.healths.includes(healthOf(env))) return false
        return matches(envSearchable(env), filters.q)
    })
    const unmanaged = list.unmanaged.filter((project) => {
        if (origins.size && !origins.has("unmanaged")) return false
        if (filters.machines.length && !filters.machines.includes(project.machine)) return false
        if (filters.healths.length && !filters.healths.includes(unmanagedHealth(project))) return false
        return matches(unmanagedSearchable(project), filters.q)
    })
    return { items, unmanaged }
}
