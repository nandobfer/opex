import { SECRETARY_TIME_ZONE } from "./constants"

/** Janelas dos limites (puras): a hora corrente (respostas por conversa) e o dia em São Paulo (orçamento). */

/** Partes de data/hora no fuso. */
function partsIn(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(date)
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00"
    return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") }
}

/** Chave do dia no fuso (`2026-11-25`). */
export function dayKey(date: Date, timeZone = SECRETARY_TIME_ZONE): string {
    const p = partsIn(date, timeZone)
    return `${p.year}-${p.month}-${p.day}`
}

/** Chave da hora no fuso (`2026-11-25T14`). */
export function hourKey(date: Date, timeZone = SECRETARY_TIME_ZONE): string {
    const p = partsIn(date, timeZone)
    return `${p.year}-${p.month}-${p.day}T${p.hour}`
}

/** Deslocamento do fuso (ms) no instante. */
function offsetMs(date: Date, timeZone: string): number {
    const local = new Date(date.toLocaleString("en-US", { timeZone }))
    const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }))
    return local.getTime() - utc.getTime()
}

/** Início do dia no fuso, como instante UTC. */
export function startOfDayIn(date: Date, timeZone = SECRETARY_TIME_ZONE): Date {
    const [y, m, d] = dayKey(date, timeZone).split("-").map(Number)
    const guess = new Date(Date.UTC(y!, m! - 1, d!))
    return new Date(guess.getTime() - offsetMs(guess, timeZone))
}

/** Janela de uma hora que termina agora (contagem de respostas por conversa). */
export function lastHourSince(now: Date): Date {
    return new Date(now.getTime() - 3600_000)
}

export interface LimitCheck {
    blocked: boolean
    kind: "limit" | "budget" | null
    /** Chave da janela: o aviso sai uma vez por janela. */
    windowKey: string | null
    reason: string | null
}

/** Decide se o limite de respostas por conversa ou o orçamento diário barram o turno. */
export function checkLimits(input: { now: Date; repliesLastHour: number; repliesPerHour: number; spentTodayUsd: number; dailyBudgetUsd: number; conversationId: string }): LimitCheck {
    if (input.spentTodayUsd >= input.dailyBudgetUsd) {
        return { blocked: true, kind: "budget", windowKey: `budget:${dayKey(input.now)}`, reason: `Orçamento diário de US$ ${input.dailyBudgetUsd.toFixed(2)} atingido (gasto US$ ${input.spentTodayUsd.toFixed(2)})` }
    }
    if (input.repliesLastHour >= input.repliesPerHour) {
        return { blocked: true, kind: "limit", windowKey: `limit:${input.conversationId}:${hourKey(input.now)}`, reason: `Limite de ${input.repliesPerHour} respostas por hora nesta conversa atingido` }
    }
    return { blocked: false, kind: null, windowKey: null, reason: null }
}
