import { isSecondsSchedule, zonedWallTimeToDate, type Schedule } from "@/lib/integrations/schedule"

/**
 * `consolidation.schedule` do Engramind (OPE-117; módulo PURO): o Engramind guarda uma expressão cron de
 * 5 campos avaliada em **UTC** (decisão 0025, sem apelidos); a tela edita com o `ScheduleEditor` das
 * Rotinas (`Schedule`, horários de Brasília). Aqui ficam as conversões nos dois sentidos. O que não cabe
 * exatamente num cron UTC (mensal que vira o dia depois do dia 28, intervalo que não divide a hora ou o
 * dia) é recusado com a mensagem; o cron que não cabe no `Schedule` abre no modo avançado (`null`).
 */

const DAY_MIN = 24 * 60

/** Minutos a somar ao horário de Brasília para chegar ao UTC (180 hoje; calculado pelo fuso, nunca fixo). */
export function utcOffsetMinutes(at = new Date()): number {
    const year = at.getUTCFullYear()
    const month = at.getUTCMonth() + 1
    const day = at.getUTCDate()
    const utc = zonedWallTimeToDate(year, month, day, 12, 0)
    return Math.round((utc.getTime() - Date.UTC(year, month - 1, day, 12, 0)) / 60_000)
}

const pad = (value: number) => String(value).padStart(2, "0")
const toMinutes = (time: string) => {
    const [hour, minute] = time.split(":").map(Number)
    return hour * 60 + minute
}
const toTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
const mod = (value: number, base: number) => ((value % base) + base) % base

/** Horário de Brasília → horário UTC e o deslocamento de dia (-1, 0 ou +1). */
function shift(time: string, offset: number): { minutes: number; dayShift: number } {
    const total = toMinutes(time) + offset
    return { minutes: mod(total, DAY_MIN), dayShift: Math.floor(total / DAY_MIN) }
}

export type CronConversion = { ok: true; cron: string } | { ok: false; error: string }

/** `Schedule` (Brasília) → cron UTC de 5 campos. */
export function scheduleToUtcCron(schedule: Schedule, at = new Date()): CronConversion {
    const offset = utcOffsetMinutes(at)
    switch (schedule.type) {
        case "interval": {
            if (isSecondsSchedule(schedule)) return { ok: false, error: "O Engramind não aceita intervalo em segundos: use minutos ou horas" }
            const minutes = schedule.minutes
            if (minutes >= 1 && minutes < 60 && 60 % minutes === 0) return { ok: true, cron: `*/${minutes} * * * *` }
            if (minutes === 60) return { ok: true, cron: "0 * * * *" }
            if (minutes % 60 === 0 && minutes < DAY_MIN && 24 % (minutes / 60) === 0) return { ok: true, cron: `0 */${minutes / 60} * * *` }
            if (minutes === DAY_MIN) return { ok: true, cron: "0 0 * * *" }
            return { ok: false, error: "Esse intervalo não cabe numa expressão cron: use um divisor de 60 minutos (1, 2, 5, 10, 15, 20, 30) ou de 24 horas (1, 2, 3, 4, 6, 8, 12 h)" }
        }
        case "daily": {
            const utc = shift(schedule.time, offset)
            return { ok: true, cron: `${utc.minutes % 60} ${Math.floor(utc.minutes / 60)} * * *` }
        }
        case "weekly": {
            const utc = shift(schedule.time, offset)
            const days = [...new Set(schedule.days.map((day) => mod(day + utc.dayShift, 7)))].sort((a, b) => a - b)
            return { ok: true, cron: `${utc.minutes % 60} ${Math.floor(utc.minutes / 60)} * * ${days.join(",")}` }
        }
        case "monthly": {
            const utc = shift(schedule.time, offset)
            const day = schedule.day + utc.dayShift
            // O Opex usa o último dia nos meses mais curtos; o cron pularia o mês: só até o dia 28 é exato.
            if (schedule.day > 28 || day < 1 || day > 28) return { ok: false, error: "Mensal só até o dia 28 (num horário que não vire o dia em UTC): use a expressão cron para outros casos" }
            return { ok: true, cron: `${utc.minutes % 60} ${Math.floor(utc.minutes / 60)} ${day} * *` }
        }
    }
}

const NUMBER = /^\d+$/
const FIELD = /^(\*|\d+(-\d+)?)(\/\d+)?(,(\*|\d+(-\d+)?)(\/\d+)?)*$/
const RANGES: [number, number][] = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
]

/**
 * Rascunho de um agendamento que não cabe no cron UTC (ex.: mensal no dia 30): vai para o formulário como
 * este marcador, que a validação recusa com a mensagem da conversão — o Salvar fica bloqueado em vez de
 * manter o cron anterior em silêncio.
 */
const INVALID_SCHEDULE_PREFIX = "invalid-schedule:"

export const invalidScheduleMarker = (error: string) => `${INVALID_SCHEDULE_PREFIX}${error}`

/** Mensagem de erro de uma expressão cron de 5 campos (sem apelidos nem segundos), ou `null` quando válida. */
export function validateCron(expression: string): string | null {
    const value = expression.trim()
    if (value.startsWith(INVALID_SCHEDULE_PREFIX)) return value.slice(INVALID_SCHEDULE_PREFIX.length) || "Agendamento inválido"
    if (!value) return "Informe a expressão cron"
    if (value.startsWith("@")) return "Apelidos (@daily, @hourly…) não são aceitos: use os 5 campos"
    const fields = value.split(/\s+/)
    if (fields.length !== 5) return "Use 5 campos: minuto hora dia mês dia-da-semana"
    for (const [index, field] of fields.entries()) {
        if (!FIELD.test(field)) return `Campo ${index + 1} inválido: ${field}`
        const [min, max] = RANGES[index]!
        for (const part of field.split(",")) {
            const [base, step] = part.split("/") as [string, string | undefined]
            if (step !== undefined && Number(step) < 1) return `Campo ${index + 1}: passo inválido`
            if (base === "*") continue
            const bounds = base.split("-").map(Number)
            if (bounds.some((number) => number < min || number > max)) return `Campo ${index + 1} fora do intervalo ${min}–${max}`
            if (bounds.length === 2 && bounds[0]! > bounds[1]!) return `Campo ${index + 1}: intervalo invertido`
        }
    }
    return null
}

/** Cron UTC → `Schedule` (Brasília); `null` quando a expressão não cabe no editor (abre no modo avançado). */
export function utcCronToSchedule(expression: string, at = new Date()): Schedule | null {
    if (validateCron(expression)) return null
    const [minute, hour, dom, month, dow] = expression.trim().split(/\s+/) as [string, string, string, string, string]
    if (month !== "*") return null
    const every = /^\*\/(\d+)$/
    if (hour === "*" && dom === "*" && dow === "*") {
        const step = every.exec(minute)
        if (step && 60 % Number(step[1]) === 0) return { type: "interval", minutes: Number(step[1]) }
        if (minute === "0") return { type: "interval", minutes: 60 }
        return null
    }
    if (minute === "0" && dom === "*" && dow === "*") {
        const step = every.exec(hour)
        if (step && 24 % Number(step[1]) === 0) return { type: "interval", minutes: Number(step[1]) * 60 }
    }
    if (!NUMBER.test(minute) || !NUMBER.test(hour)) return null
    const offset = utcOffsetMinutes(at)
    const total = Number(hour) * 60 + Number(minute) - offset
    const local = mod(total, DAY_MIN)
    const dayShift = Math.floor(total / DAY_MIN)
    const time = toTime(local)
    if (dom === "*" && dow === "*") return { type: "daily", time }
    if (dom === "*" && /^\d+(,\d+)*$/.test(dow)) {
        const days = [...new Set(dow.split(",").map((day) => mod(Number(day) % 7 + dayShift, 7)))].sort((a, b) => a - b)
        return { type: "weekly", days, time }
    }
    if (dow === "*" && NUMBER.test(dom)) {
        const day = Number(dom) + dayShift
        if (day < 1 || day > 28) return null
        return { type: "monthly", day, time }
    }
    return null
}
