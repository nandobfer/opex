import Fuse from "fuse.js"
import { urlFilterCodecs, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { dayCodec } from "@/lib/list/day-filter"
import { DEFAULT_METRICS_PERIOD, METRICS_PERIODS, type MetricsPeriod } from "@/features/agent-metrics/period"
import type { RoutineAgentDto } from "./types"

/**
 * Filtros da lista `/agentes-rotineiros` (OPE-130, D18), na URL: busca (nome e objetivo, tolerante a erro
 * de digitação), status, motor e o período dos KPIs e do gráfico de cada linha.
 */

export const ROUTINE_LIST_STATUSES = ["active", "paused", "provisioning", "provisioning_error"] as const
export type RoutineListStatus = (typeof ROUTINE_LIST_STATUSES)[number]
export const ROUTINE_LIST_STATUS_LABELS: Record<RoutineListStatus, string> = {
    active: "Ativo",
    paused: "Pausado",
    provisioning: "Provisionando",
    provisioning_error: "Com erro de provisionamento",
}
export const ROUTINE_LIST_ENGINES = ["all", "opex", "opencode"] as const
export type RoutineListEngine = (typeof ROUTINE_LIST_ENGINES)[number]

export interface RoutineListFilters {
    busca: string
    status: string[]
    motor: RoutineListEngine
    periodo: MetricsPeriod
    de: string
    ate: string
}

export const DEFAULT_ROUTINE_LIST_FILTERS: RoutineListFilters = { busca: "", status: [], motor: "all", periodo: DEFAULT_METRICS_PERIOD, de: "", ate: "" }

export const ROUTINE_LIST_FILTER_SCHEMA: UrlFilterSchema<RoutineListFilters> = {
    busca: urlFilterCodecs.string(),
    status: urlFilterCodecs.strings(),
    motor: urlFilterCodecs.string<RoutineListEngine>(ROUTINE_LIST_ENGINES),
    periodo: urlFilterCodecs.string<MetricsPeriod>(METRICS_PERIODS),
    de: dayCodec,
    ate: dayCodec,
}

/** Status da lista de um agente: o provisionamento incompleto vence o status do agente. */
export function routineListStatusOf(agent: Pick<RoutineAgentDto, "status" | "provisioning">): RoutineListStatus {
    if (agent.provisioning.status === "error") return "provisioning_error"
    if (agent.provisioning.status === "pending" || agent.provisioning.status === "running") return "provisioning"
    return agent.status === "paused" ? "paused" : "active"
}

/** Aplica busca, status e motor (o período vale para as métricas, não para a lista). */
export function filterRoutineAgents<T extends Pick<RoutineAgentDto, "title" | "objective" | "status" | "provisioning" | "engine">>(agents: readonly T[], filters: Pick<RoutineListFilters, "busca" | "status" | "motor">): T[] {
    const term = filters.busca.trim()
    const base = term ? new Fuse([...agents], { keys: ["title", "objective"], threshold: 0.4, ignoreLocation: true }).search(term).map((hit) => hit.item) : [...agents]
    return base.filter((agent) => (filters.status.length ? filters.status.includes(routineListStatusOf(agent)) : true) && (filters.motor === "all" || agent.engine === filters.motor))
}

/** Parâmetros das métricas pelo período escolhido. */
export const routineMetricsParams = (filters: Pick<RoutineListFilters, "periodo" | "de" | "ate">): Record<string, string> => ({
    periodo: filters.periodo,
    ...(filters.de ? { de: filters.de } : {}),
    ...(filters.ate ? { ate: filters.ate } : {}),
})
