import type { RoutineTrigger } from "./schemas"

/**
 * Recorrência dos gatilhos agendados (OPE-130, módulo PURO), sempre no **horário de Brasília**
 * (UTC−3 fixo: o Brasil não tem horário de verão desde 2019).
 *
 * - `interval`: a cada N minutos/horas, contados a partir do último disparo (ou da criação);
 * - `daily`: todo dia no horário; `weekly`: nos dias da semana (0 = domingo) no horário;
 * - `once`: data e hora únicas (`YYYY-MM-DDTHH:mm` em Brasília); depois de disparar, não há próximo.
 * - `webhook` não tem horário.
 *
 * Disparos perdidos (agendador desligado, app parado): o tick dispara **uma** vez, registra o atraso e
 * recalcula o próximo horário a partir de agora — nunca um disparo por janela perdida.
 */

export const BRASILIA_OFFSET_MINUTES = -180
const DAY_MS = 86_400_000
const offsetMs = BRASILIA_OFFSET_MINUTES * 60_000

/** Instante (UTC) de uma data/hora de Brasília. */
export function brasiliaToUtc(year: number, monthIndex: number, day: number, hours: number, minutes: number): Date {
    return new Date(Date.UTC(year, monthIndex, day, hours, minutes) - offsetMs)
}

/** Partes da data em Brasília. */
export function brasiliaParts(date: Date): { year: number; month: number; day: number; weekday: number; hours: number; minutes: number } {
    const local = new Date(date.getTime() + offsetMs)
    return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate(), weekday: local.getUTCDay(), hours: local.getUTCHours(), minutes: local.getUTCMinutes() }
}

const parseTime = (time: string) => time.split(":").map(Number) as [number, number]

/** `YYYY-MM-DDTHH:mm` de Brasília → instante; inválida → `null`. */
export function parseBrasiliaLocal(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
    if (!match) return null
    const [, y, m, d, h, min] = match.map(Number) as number[]
    const date = brasiliaToUtc(y!, m! - 1, d!, h!, min!)
    return Number.isNaN(date.getTime()) ? null : date
}

/** Instante → `YYYY-MM-DDTHH:mm` de Brasília (campo do formulário). */
export function formatBrasiliaLocal(date: Date): string {
    const p = brasiliaParts(date)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}T${pad(p.hours)}:${pad(p.minutes)}`
}

/** Próximo horário em que um dos dias aceitos cai no horário, estritamente depois de `after`. */
function nextAtTime(after: Date, time: string, accepts: (weekday: number) => boolean): Date | null {
    const [hours, minutes] = parseTime(time)
    const base = brasiliaParts(after)
    for (let offset = 0; offset <= 8; offset++) {
        const candidate = brasiliaToUtc(base.year, base.month, base.day + offset, hours, minutes)
        if (candidate.getTime() <= after.getTime()) continue
        if (accepts(brasiliaParts(candidate).weekday)) return candidate
    }
    return null
}

/**
 * Próximo disparo de um gatilho depois de `after`. `lastFiredAt` ancora o intervalo e encerra o único.
 * Gatilho desligado ou webhook → `null`.
 */
export function nextFireAt(trigger: RoutineTrigger, after: Date, lastFiredAt: Date | null = null): Date | null {
    if (!trigger.enabled) return null
    switch (trigger.kind) {
        case "interval": {
            const step = trigger.every * (trigger.unit === "hours" ? 3_600_000 : 60_000)
            const anchor = lastFiredAt ?? after
            const next = new Date(anchor.getTime() + step)
            return next.getTime() > after.getTime() ? next : new Date(after.getTime() + step)
        }
        case "daily":
            return nextAtTime(after, trigger.time, () => true)
        case "weekly": {
            const days = new Set(trigger.days)
            return nextAtTime(after, trigger.time, (weekday) => days.has(weekday))
        }
        case "once": {
            if (lastFiredAt) return null
            return parseBrasiliaLocal(trigger.at)
        }
        case "webhook":
            return null
    }
}

export interface DueFire {
    /** Atraso do disparo (agora − horário previsto), em ms. */
    delayMs: number
    /** Próximo horário depois deste disparo (`null` = acabou: único, ou desligado). */
    nextAt: Date | null
}

/** Decide o disparo vencido de um gatilho no tick: um só, com o atraso, e o próximo horário a partir de agora. */
export function dueFire(trigger: RoutineTrigger, scheduledAt: Date | null, now: Date): DueFire | null {
    if (!trigger.enabled || !scheduledAt || trigger.kind === "webhook") return null
    if (scheduledAt.getTime() > now.getTime()) return null
    const delayMs = Math.max(0, now.getTime() - scheduledAt.getTime())
    const nextAt = trigger.kind === "once" ? null : nextFireAt(trigger, now, now)
    return { delayMs, nextAt }
}

/** Texto curto do gatilho para listas ("A cada 15 min", "Diário às 08:00"…). */
export function describeTrigger(trigger: RoutineTrigger): string {
    const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
    switch (trigger.kind) {
        case "interval":
            return `A cada ${trigger.every} ${trigger.unit === "hours" ? (trigger.every === 1 ? "hora" : "horas") : "min"}`
        case "daily":
            return `Diário às ${trigger.time}`
        case "weekly":
            return `${[...trigger.days].sort().map((day) => WEEKDAYS[day]).join(", ")} às ${trigger.time}`
        case "once": {
            const date = parseBrasiliaLocal(trigger.at)
            if (!date) return "Data inválida"
            const p = brasiliaParts(date)
            const pad = (n: number) => String(n).padStart(2, "0")
            return `Em ${pad(p.day)}/${pad(p.month + 1)}/${p.year} às ${pad(p.hours)}:${pad(p.minutes)}`
        }
        case "webhook":
            return "Webhook externo"
    }
}

export const DAY_IN_MS = DAY_MS

export interface TriggerStateLike {
    trigger: RoutineTrigger
    nextAt: Date | null
    lastFiredAt: Date | null
}

/**
 * Estado dos gatilhos depois de salvar a configuração: o mesmo gatilho (id e definição iguais) mantém
 * o próximo horário e o último disparo; o alterado recalcula a partir de agora (o único já disparado
 * com a mesma data não dispara de novo).
 */
export function buildTriggerStates(triggers: readonly RoutineTrigger[], previous: readonly TriggerStateLike[], now: Date): TriggerStateLike[] {
    const byId = new Map(previous.map((state) => [state.trigger.id, state]))
    return triggers.map((trigger) => {
        const old = byId.get(trigger.id)
        if (old && JSON.stringify(old.trigger) === JSON.stringify(trigger)) return { trigger, nextAt: old.nextAt ?? (trigger.kind === "once" && old.lastFiredAt ? null : nextFireAt(trigger, now, old.lastFiredAt)), lastFiredAt: old.lastFiredAt }
        const sameOnce = old && old.trigger.kind === "once" && trigger.kind === "once" && old.trigger.at === trigger.at && old.lastFiredAt
        const lastFiredAt = sameOnce ? old.lastFiredAt : null
        return { trigger, nextAt: nextFireAt(trigger, now, lastFiredAt), lastFiredAt }
    })
}
