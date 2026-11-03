import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

/** Formatação dos valores das métricas (módulo puro). `null` é "—" (sem base, nunca zero). */

export type MetricValueFormat = "percent" | "count" | "decimal" | "hours" | "duration" | "usd" | "tokens"

const decimal = (value: number, digits = 1) => value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits })

export const EMPTY_METRIC = "—"

export function formatMetricValue(value: number | null | undefined, format: MetricValueFormat): string {
    if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_METRIC
    switch (format) {
        case "percent":
            return `${decimal(value)}%`
        case "count":
            return Math.round(value).toLocaleString("pt-BR")
        case "decimal":
            return decimal(value)
        case "hours":
            return `${decimal(value)} h`
        case "duration":
            return value >= 60 ? `${decimal(value / 60)} h` : `${decimal(value)} min`
        case "usd":
            return value.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 })
        case "tokens":
            if (value >= 1_000_000) return `${decimal(value / 1_000_000)}M`
            if (value >= 1000) return `${decimal(value / 1000)}k`
            return Math.round(value).toLocaleString("pt-BR")
    }
}

/** Rótulo do bucket: dia/semana → `dd/MM`; mês (`YYYY-MM`) → `MMM/yy`. */
export function formatBucketLabel(bucket: string): string {
    if (/^\d{4}-\d{2}$/.test(bucket)) return format(parseISO(`${bucket}-01`), "MMM/yy", { locale: ptBR })
    return format(parseISO(bucket), "dd/MM", { locale: ptBR })
}
