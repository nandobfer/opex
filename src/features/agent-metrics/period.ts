import { z } from "zod"
import { dayKey, type BucketMode } from "@/lib/time/buckets"
import { METRICS_TIME_ZONE } from "./constants"

/**
 * Período e filtros da Visão geral dos agentes (módulo puro, cliente e servidor; OPE-122). O período
 * fica na URL (`?periodo=30d`, ou `custom` com `de`/`ate` em `yyyy-MM-dd`); o intervalo é calculado no
 * fuso fixo das métricas (America/Sao_Paulo), do início do primeiro dia ao fim do último.
 */

export const METRICS_PERIODS = ["7d", "30d", "90d", "12m", "custom"] as const
export type MetricsPeriod = (typeof METRICS_PERIODS)[number]
export const DEFAULT_METRICS_PERIOD: MetricsPeriod = "30d"

export const METRICS_PERIOD_LABELS: Record<MetricsPeriod, string> = {
    "7d": "7 dias",
    "30d": "30 dias",
    "90d": "90 dias",
    "12m": "12 meses",
    custom: "Personalizado",
}

/** Margem padrão do Agente Orçamentista (±%). */
export const DEFAULT_ESTIMATE_MARGIN = 20

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

/** Margem do Orçamentista: inteiro de 1 a 100; vazia, negativa, acima de 100 ou inválida volta a 20. */
export function parseMargin(value: string | number | null | undefined): number {
    const number = typeof value === "number" ? value : value === null || value === undefined || String(value).trim() === "" ? NaN : Number(value)
    return Number.isFinite(number) && number > 0 && number <= 100 ? number : DEFAULT_ESTIMATE_MARGIN
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs))
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"))
    return asUtc - utcMs
}

/** Início (00:00) do dia `yyyy-MM-dd` no fuso, em ms. */
export function startOfZonedDay(day: string, timeZone: string = METRICS_TIME_ZONE): number {
    const [year, month, date] = day.split("-").map(Number)
    const guess = Date.UTC(year!, month! - 1, date!)
    return guess - zoneOffsetMs(guess, timeZone)
}

function shiftDay(day: string, days: number): string {
    const [year, month, date] = day.split("-").map(Number)
    const ms = Date.UTC(year!, month! - 1, date!) + days * DAY_MS
    return new Date(ms).toISOString().slice(0, 10)
}

function shiftMonths(day: string, months: number): string {
    const [year, month, date] = day.split("-").map(Number)
    const target = new Date(Date.UTC(year!, month! - 1 + months, 1))
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
    return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date!, last))).toISOString().slice(0, 10)
}

export interface MetricsRange {
    from: Date
    to: Date
    fromDay: string
    toDay: string
}

/**
 * Período → intervalo inclusivo (início do primeiro dia → fim do último), no fuso das métricas.
 * Intervalo personalizado incompleto ou invertido cai no padrão de 30 dias.
 */
export function resolveMetricsRange(input: { periodo: MetricsPeriod; de?: string | null; ate?: string | null }, now: Date = new Date(), timeZone: string = METRICS_TIME_ZONE): MetricsRange {
    const today = dayKey(now.getTime(), timeZone)
    let fromDay: string
    let toDay = today
    if (input.periodo === "custom" && input.de && input.ate && DAY_PATTERN.test(input.de) && DAY_PATTERN.test(input.ate) && input.de <= input.ate) {
        fromDay = input.de
        toDay = input.ate
    } else if (input.periodo === "12m") fromDay = shiftDay(shiftMonths(today, -12), 1)
    else {
        const days = input.periodo === "7d" ? 7 : input.periodo === "90d" ? 90 : 30
        fromDay = shiftDay(today, -(days - 1))
    }
    return { from: new Date(startOfZonedDay(fromDay, timeZone)), to: new Date(startOfZonedDay(shiftDay(toDay, 1), timeZone) - 1), fromDay, toDay }
}

/** Agrupamento do gráfico: por dia até 31 dias, por semana até ~6 meses, por mês acima disso. */
export function metricsBucketMode(from: Date, to: Date): BucketMode {
    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS)
    if (days <= 31) return "day"
    if (days <= 183) return "week"
    return "month"
}

const csv = z
    .string()
    .optional()
    .transform((value) =>
        (value ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
    )

/** Query de `GET /api/agents/[agent]/metrics` e `/history` (mesmos filtros da URL da página). */
export const agentMetricsQuerySchema = z.object({
    periodo: z.enum(METRICS_PERIODS).default(DEFAULT_METRICS_PERIOD),
    de: z.string().regex(DAY_PATTERN).optional(),
    ate: z.string().regex(DAY_PATTERN).optional(),
    clientes: csv,
    repositorios: csv,
    margem: z.string().optional(),
})
export type AgentMetricsQuery = z.infer<typeof agentMetricsQuerySchema>

export const agentHistoryQuerySchema = agentMetricsQuerySchema.extend({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type AgentHistoryQuery = z.infer<typeof agentHistoryQuerySchema>

/** Filtros da URL da página → parâmetros da API (vazios omitidos). */
export function toMetricsParams(filters: { periodo: MetricsPeriod; de: string; ate: string; clientes: readonly string[]; repositorios: readonly string[]; margem?: string }): Record<string, string> {
    const params: Record<string, string> = { periodo: filters.periodo }
    if (filters.periodo === "custom") {
        if (filters.de) params.de = filters.de
        if (filters.ate) params.ate = filters.ate
    }
    if (filters.clientes.length) params.clientes = filters.clientes.join(",")
    if (filters.repositorios.length) params.repositorios = filters.repositorios.join(",")
    if (filters.margem) params.margem = filters.margem
    return params
}
