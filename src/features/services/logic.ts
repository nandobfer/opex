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

/** Horas decimais normalizadas (nunca negativas, 2 casas). */
export const roundHours = (value: number) => round2(Math.max(0, Number.isFinite(value) ? value : 0))

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
 * Lê um valor de horas digitado e devolve as horas decimais. Aceita `H:mm` (`1:30` → `1,5`) e
 * decimal com ponto ou vírgula (`1.5`/`1,5`). `null` quando inválido ou negativo.
 */
export function parseHoursInput(value: string): number | null {
    const text = value.trim().replace(/\s/g, "")
    if (!text) return null
    const clock = /^(\d+):([0-5]?\d)$/.exec(text)
    if (clock) {
        const hours = Number(clock[1])
        const minutes = Number(clock[2])
        if (minutes > 59) return null
        return round2(hours + minutes / 60)
    }
    const decimal = Number(text.replace(",", "."))
    if (!Number.isFinite(decimal) || decimal < 0) return null
    return round2(decimal)
}

/** Formata horas decimais como `H:mm` (ex.: `1,5` → `1:30`). */
export function formatHoursInput(hours: number): string {
    const totalMinutes = Math.round(Math.max(0, Number.isFinite(hours) ? hours : 0) * 60)
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return `${h}:${String(m).padStart(2, "0")}`
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
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}
