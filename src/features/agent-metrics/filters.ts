"use client"

import { urlFilterCodecs, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { dayCodec } from "@/lib/list/day-filter"
import { DEFAULT_METRICS_PERIOD, METRICS_PERIODS, type MetricsPeriod } from "./period"

/** Filtros da Visão geral e do Histórico na URL (`?periodo=&de=&ate=&clientes=&repositorios=&margem=`). */
export interface AgentMetricsFilters {
    periodo: MetricsPeriod
    de: string
    ate: string
    clientes: string[]
    repositorios: string[]
    margem: string
}

export const DEFAULT_AGENT_METRICS_FILTERS: AgentMetricsFilters = { periodo: DEFAULT_METRICS_PERIOD, de: "", ate: "", clientes: [], repositorios: [], margem: "" }

export const AGENT_METRICS_FILTER_SCHEMA: UrlFilterSchema<AgentMetricsFilters> = {
    periodo: urlFilterCodecs.string<MetricsPeriod>(METRICS_PERIODS),
    de: dayCodec,
    ate: dayCodec,
    clientes: urlFilterCodecs.strings(),
    repositorios: urlFilterCodecs.strings(),
    margem: urlFilterCodecs.string(),
}
