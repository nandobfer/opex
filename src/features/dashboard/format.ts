import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { formatNumberBR } from "@/lib/format"
import { formatHoursLabel } from "@/features/orcamentos/logic"

/** Formatação da tela Dashboards. Módulo puro. */

/** Faturamento em reais (ex.: `R$ 1.234,56`). */
export function formatBrl(value: number): string {
    return `R$ ${formatNumberBR(value)}`
}

/** Custo em dólares (ex.: `US$ 0,02`). */
export function formatUsd(value: number): string {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

/** Horas do cliente em `H:mm` (ex.: `2:30`). */
export function formatHours(hours: number): string {
    return formatHoursLabel(hours)
}

/** Número inteiro em pt-BR. */
export function formatCount(value: number): string {
    return Math.round(value).toLocaleString("pt-BR")
}

/** Tokens em forma curta (ex.: `12,4k`, `1,2M`). */
export function formatTokens(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")}M`
    if (value >= 1000) return `${(value / 1000).toFixed(1).replace(".", ",")}k`
    return formatCount(value)
}

/** Rótulo do bucket: dia/semana → `dd/MM`; mês (`YYYY-MM`) → `MMM/yy`. */
export function formatBucketLabel(bucket: string): string {
    if (/^\d{4}-\d{2}$/.test(bucket)) return format(parseISO(`${bucket}-01`), "MMM/yy", { locale: ptBR })
    return format(parseISO(bucket), "dd/MM", { locale: ptBR })
}
