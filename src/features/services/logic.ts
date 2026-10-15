import { format } from "date-fns"
import { roundHours } from "@/features/orcamentos/logic"
import { formatEstimateDuration, parseEstimateDuration } from "@/features/tasks/estimate-duration"
import type { ServiceCalcOrigin } from "./constants"

/**
 * Regras puras do módulo Serviços (testáveis sem banco nem React): a relação entre os três campos
 * reativos (duração real, inflada e faturamento) e a conversão `H:mm` ↔ horas decimais.
 *
 * Relação (idêntica à estimativa das tarefas):
 *   clientHours = hours × factor
 *   billingBrl  = clientHours × hourlyRate
 *
 * O **último campo editado** é a fonte da verdade e recalcula os outros dois. Quando o cálculo de um
 * campo exigiria **divisão por zero** (`factor`/`hourlyRate` iguais a zero), o campo digitado é
 * preservado e o não derivável vira **zero** — nunca `NaN`/`Infinity`.
 */

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export { roundHours }

export interface ServiceAmountInput {
    /** Campo que o usuário acabou de editar. */
    origin: ServiceCalcOrigin
    hours: number
    clientHours: number
    billingBrl: number
    /** Fator de lucro do cliente. */
    factor: number
    /** Custo por hora do cliente. */
    hourlyRate: number
}

export interface ServiceAmounts {
    hours: number
    clientHours: number
    billingBrl: number
}

/** Recalcula os três valores a partir do campo editado, do fator e do custo/hora. */
export function computeServiceAmounts(input: ServiceAmountInput): ServiceAmounts {
    const factor = Number.isFinite(input.factor) ? input.factor : 1
    const hourlyRate = Number.isFinite(input.hourlyRate) ? input.hourlyRate : 0

    if (input.origin === "clientHours") {
        const clientHours = roundHours(input.clientHours)
        return { clientHours, hours: factor !== 0 ? round2(clientHours / factor) : 0, billingBrl: round2(clientHours * hourlyRate) }
    }

    if (input.origin === "billingBrl") {
        const billingBrl = roundHours(input.billingBrl)
        const clientHours = hourlyRate !== 0 ? round2(billingBrl / hourlyRate) : 0
        return { billingBrl, clientHours, hours: factor !== 0 ? round2(clientHours / factor) : 0 }
    }

    const hours = roundHours(input.hours)
    const clientHours = round2(hours * factor)
    return { hours, clientHours, billingBrl: round2(clientHours * hourlyRate) }
}

/**
 * Lê um valor de horas digitado (`hh:mm`) e devolve as horas decimais. Reusa o helper compartilhado da
 * **estimativa da tarefa** (`estimate-duration`), que exige o formato completo — `null` enquanto o
 * usuário ainda está digitando (ex.: só as horas) ou quando o valor é inválido.
 */
export function parseHoursInput(value: string): number | null {
    const parsed = parseEstimateDuration(value)
    return parsed.status === "valid" ? round2(parsed.hours) : null
}

/** Formata horas decimais como `hh:mm` (ex.: `1,5` → `01:30`). Mesmo formato do campo de estimativa. */
export function formatHoursInput(hours: number): string {
    return formatEstimateDuration(hours)
}

/** Lê um valor em reais digitado (`1.234,56` ou `1234.56`). `null` quando inválido ou negativo. */
export function parseMoneyInput(value: string): number | null {
    const text = value.trim()
    if (!text) return null
    // Formato pt-BR: pontos de milhar e vírgula decimal. Sem vírgula, o ponto é o decimal.
    const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "")
    const numeric = Number(normalized)
    if (!Number.isFinite(numeric) || numeric < 0) return null
    return round2(numeric)
}

/** Formata reais como `1.234,56` (sem o prefixo `R$`), para o campo de entrada. */
export function formatMoneyInput(value: number): string {
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0
    return safe.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Data (`yyyy-MM-dd`) do dia corrente no fuso local — valor inicial do campo Data do serviço. */
export function todayDateInput(now: Date = new Date()): string {
    return format(now, "yyyy-MM-dd")
}
