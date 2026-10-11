import { formatNumberBR } from "@/lib/format"
import { formatHoursLabel } from "@/features/orcamentos/logic"

/** Formatação da visão Financeiro. Módulo puro. */

/** Faturamento em reais (ex.: `R$ 1.234,56`). */
export function formatBillingBrl(value: number): string {
    return `R$ ${formatNumberBR(value)}`
}

/** Horas em `H:mm` com o sufixo (ex.: `2:30 h`). */
export function formatHours(hours: number): string {
    return `${formatHoursLabel(hours)} h`
}
