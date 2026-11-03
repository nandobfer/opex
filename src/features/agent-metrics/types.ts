import type { BucketMode } from "@/lib/time/buckets"
import type { AgentId } from "./catalog"

/** DTOs da Visão geral e do Histórico dos agentes (OPE-122). As métricas são calculadas no servidor. */

export type MetricFormat = "percent" | "count" | "decimal" | "hours" | "duration" | "usd" | "tokens"

export interface MetricKpiDto {
    id: string
    label: string
    hint: string
    /** `null` = sem base no período ("—"), nunca zero inventado. */
    value: number | null
    format: MetricFormat
    /** Métrica não retroativa: registrada desde esta data (ISO). */
    since: string | null
    /** Antes desta data o valor é aproximado (ISO). */
    approximateUntil?: string | null
}

export interface MetricSeriesDto {
    key: string
    label: string
    defaultSelected: boolean
}

/** Ponto do gráfico: `bucket` (`YYYY-MM-DD` ou `YYYY-MM`) e um valor por série (`null` = sem base). */
export type MetricPointDto = { bucket: string } & Record<string, number | string | null>

export interface MetricLineChartDto {
    id: string
    title: string
    description: string
    format: MetricFormat
    series: MetricSeriesDto[]
    points: MetricPointDto[]
}

export interface MetricBarItemDto {
    key: string
    label: string
    value: number
    /** Texto extra no tooltip (ex.: "12% de falha"). */
    detail?: string | null
}

export interface MetricBarChartDto {
    id: string
    title: string
    description: string
    format: MetricFormat
    items: MetricBarItemDto[]
}

export interface UsagePointDto {
    bucket: string
    runs: number
    failures: number
}

export interface MetricsNoticeDto {
    /** Métricas a que o aviso se refere. */
    label: string
    since: string
}

export interface AgentMetricsDto {
    agent: AgentId
    range: { from: string; to: string }
    bucketMode: BucketMode
    /** Último uso do agente (ignora o período e os filtros). */
    lastUsedAt: string | null
    /** O que a "Uso por data" conta (ex.: "turnos", "rodadas"). */
    usageUnit: string
    usage: UsagePointDto[]
    kpis: MetricKpiDto[]
    lines: MetricLineChartDto[]
    bars: MetricBarChartDto[]
    /** Base das métricas do agente no período (ex.: mesas concluídas). 0 = estado vazio. */
    baseCount: number
    baseLabel: string
    /** Explicação do estado vazio. */
    emptyReason: string
    /** "Dados desde dd/mm/aaaa" das métricas não retroativas. */
    notices: MetricsNoticeDto[]
    /** Opções dos filtros de cliente e repositório. */
    clients: { id: string; name: string }[]
    projects: { id: string; name: string; repo: string | null }[]
}

export interface AgentHistoryItemDto {
    id: string
    at: string
    title: string
    subtitle: string | null
    status: { label: string; tone: "success" | "warning" | "danger" | "info" | "muted" }
    href: string | null
    /** Linha sem link: o motivo (ex.: "Conversa removida pela retenção"). */
    unavailable: string | null
    chips: string[]
}

export interface AgentHistoryPageDto {
    items: AgentHistoryItemDto[]
    page: number
    limit: number
    total: number
    totalPages: number
}
