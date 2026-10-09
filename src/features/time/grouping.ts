import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { TimeLogDto } from "./types"

/** Agrupamento dos apontamentos por dia (Minhas horas). Módulo puro. */

export interface TimeLogDay {
    /** `yyyy-MM-dd` no fuso local. */
    key: string
    label: string
    logs: TimeLogDto[]
    /** Minutos dos apontamentos encerrados do dia. */
    totalMinutes: number
}

export function groupTimeLogsByDay(logs: readonly TimeLogDto[]): TimeLogDay[] {
    const days = new Map<string, TimeLogDay>()
    const sorted = [...logs].sort((a, b) => b.startTime.localeCompare(a.startTime))
    for (const log of sorted) {
        const start = new Date(log.startTime)
        const key = format(start, "yyyy-MM-dd")
        let day = days.get(key)
        if (!day) {
            const label = format(start, "EEEE, dd 'de' MMMM", { locale: ptBR })
            day = { key, label: label.charAt(0).toUpperCase() + label.slice(1), logs: [], totalMinutes: 0 }
            days.set(key, day)
        }
        day.logs.push(log)
        day.totalMinutes += log.duration ?? 0
    }
    return [...days.values()]
}
