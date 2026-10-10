import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { TimeLogDto } from "./types"

/** Agrupamento dos apontamentos por dia (Horas agênticas). Módulo puro. */

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

/** Um grupo de apontamentos de uma mesma task/mesa (dentro de um dia). */
export interface TimeLogTask {
    /** Chave do grupo: o `taskId` (uma mesa por tarefa; legados sem mesa usam o mesmo `taskId`). */
    key: string
    taskId: string
    taskCode: string | null
    taskTitle: string | null
    logs: TimeLogDto[]
    /** Minutos dos apontamentos encerrados do grupo. */
    totalMinutes: number
    /** Tokens somados do grupo (entrada + saída + raciocínio). */
    totalTokens: number
    /** Custo em dólares somado do grupo. */
    totalCostUsd: number
    /** O grupo contém algum período ativo (em execução)? */
    hasActive: boolean
}

/**
 * Agrupa os apontamentos de um dia por task/mesa (agrupamento do nível abaixo do dia). Ordena os
 * grupos pela atividade mais recente do dia e mantém a ordem dos itens (início mais recente primeiro)
 * dentro de cada grupo. Módulo puro.
 */
export function groupTimeLogsByTask(logs: readonly TimeLogDto[]): TimeLogTask[] {
    const groups = new Map<string, TimeLogTask>()
    const sorted = [...logs].sort((a, b) => b.startTime.localeCompare(a.startTime))
    for (const log of sorted) {
        let group = groups.get(log.taskId)
        if (!group) {
            group = { key: log.taskId, taskId: log.taskId, taskCode: log.taskCode, taskTitle: log.taskTitle, logs: [], totalMinutes: 0, totalTokens: 0, totalCostUsd: 0, hasActive: false }
            groups.set(log.taskId, group)
        }
        group.logs.push(log)
        group.totalMinutes += log.duration ?? 0
        group.totalTokens += log.inputTokens + log.outputTokens + log.reasoningTokens
        group.totalCostUsd += log.costUsd
        if (log.active) group.hasActive = true
    }
    return [...groups.values()]
}
