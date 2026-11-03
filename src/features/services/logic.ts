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

/** Hora UTC em que a data do serviço é gravada: meio-dia cai no mesmo dia de calendário de UTC−11 a UTC+11. */
export const SERVICE_DATE_UTC_HOUR = 12

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Data do serviço (`yyyy-MM-dd`, sem hora) → instante gravado no banco, ao **meio-dia UTC**. Assim o
 * filtro do período (início/fim do dia no fuso do navegador) e a exibição local não recuam nem avançam
 * um dia (OPE-125: meia-noite UTC virava o dia anterior em America/Sao_Paulo). `null` se inválida.
 */
export function serviceDateFromInput(value: string): Date | null {
    const match = DATE_KEY.exec(value)
    if (!match) return null
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
    const date = new Date(Date.UTC(year, month - 1, day, SERVICE_DATE_UTC_HOUR))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    return date
}

/** Instante gravado (ISO, `Date` ou ms) → data do serviço `yyyy-MM-dd`, pelo calendário UTC (sem fuso). */
export function serviceDateKey(value: string | number | Date): string {
    return new Date(value).toISOString().slice(0, 10)
}

/** Data do serviço como `dd/MM/yyyy`, a partir da própria data (independe do fuso de quem vê). */
export function formatServiceDate(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined || value === "") return "—"
    const time = new Date(value).getTime()
    if (Number.isNaN(time)) return "—"
    const [year, month, day] = serviceDateKey(time).split("-")
    return `${day}/${month}/${year}`
}

/**
 * Limite do período da consulta de serviços → instante. ISO completo vale como veio (o navegador
 * envia início/fim do dia local); só data (`yyyy-MM-dd`, ex.: Agente Opex) vira o dia UTC inteiro —
 * início `00:00:00.000Z`, fim `23:59:59.999Z` —, para incluir o serviço gravado ao meio-dia UTC.
 */
export function serviceRangeBound(value: string, edge: "from" | "to"): Date {
    if (DATE_KEY.test(value)) return new Date(`${value}T${edge === "from" ? "00:00:00.000" : "23:59:59.999"}Z`)
    return new Date(value)
}
