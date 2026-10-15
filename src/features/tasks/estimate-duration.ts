/**
 * Duração da **estimativa da tarefa**: converte entre o formato exibido/editado `hh:mm` e as horas
 * **decimais** do contrato da API (`PATCH /api/tasks/[id]/estimate`, campo `hours`).
 *
 * O valor gravado continua decimal (é ele que alimenta o prazo do cliente, o faturamento e os
 * selos das listas); a conversão existe só na borda de edição da página da tarefa.
 *
 * A ida e a volta fecham no minuto: o servidor arredonda as horas a 2 casas (`roundHours`), o que
 * erra no máximo 0,005 h = 0,3 min — abaixo de meio minuto, então voltar a minutos devolve sempre o
 * minuto digitado.
 *
 * Módulo **puro** (cliente e servidor).
 */

/** Limite de horas do contrato (`updateTaskEstimateSchema`). */
export const ESTIMATE_MAX_HOURS = 10_000

const MAX_TOTAL_MINUTES = ESTIMATE_MAX_HOURS * 60

/** Total de minutos de um valor em horas, arredondado e nunca negativo. */
export function estimateHoursToMinutes(hours: number): number {
    return Math.max(0, Math.round((hours || 0) * 60))
}

/** Duração de horas decimais em `hh:mm` (ex.: `1.5` → `01:30`, `2` → `02:00`, `100.25` → `100:15`). */
export function formatEstimateDuration(hours: number): string {
    const total = estimateHoursToMinutes(hours)
    const h = Math.floor(total / 60)
    const m = total % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Por que a duração digitada não serve: formato fora de `hh:mm` ou acima do limite do contrato. */
export type EstimateDurationIssue = "format" | "range"

/** Leitura da duração digitada no campo. */
export type EstimateDurationParse =
    | { status: "empty" }
    /** Ainda em digitação (só as horas, ou as horas e os `:`): não vale salvar **nem** acusar erro. */
    | { status: "incomplete" }
    | { status: "invalid"; issue: EstimateDurationIssue }
    | { status: "valid"; hours: number; minutes: number }

/** `hh:mm` completo: 1 a 5 dígitos de horas e 1 a 2 de minutos (os zeros à esquerda são opcionais). */
const COMPLETE = /^(\d{1,5}):(\d{1,2})$/
/** Digitação em andamento: apenas horas, ou horas seguidas dos `:` já sem os minutos. */
const INCOMPLETE = /^\d{0,5}:?$/

/**
 * Lê a duração digitada em `hh:mm` e devolve as horas decimais (`hours`) e o total de minutos
 * (`minutes`, usado para saber se o valor mudou em relação ao gravado).
 *
 * Valores completos exigem os minutos logo depois dos `:`; `1:5` é lido como `1:05`.
 */
export function parseEstimateDuration(value: string): EstimateDurationParse {
    const text = value.trim()
    if (text === "") return { status: "empty" }

    const match = COMPLETE.exec(text)
    if (!match) return INCOMPLETE.test(text) ? { status: "incomplete" } : { status: "invalid", issue: "format" }

    const minutes = Number(match[2])
    if (minutes > 59) return { status: "invalid", issue: "format" }

    const total = Number(match[1]) * 60 + minutes
    if (total > MAX_TOTAL_MINUTES) return { status: "invalid", issue: "range" }

    return { status: "valid", hours: total / 60, minutes: total }
}
