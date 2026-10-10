"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { TimeLogDto } from "../types"
import { useActiveTimers, useTimeRealtime } from "../hooks/useTime"

/** Tarefa que pode ter período ativo (o mínimo do card/linha/página). */
export interface TimerTask {
    id: string
    code: string
    title: string
}

interface TimerContextValue {
    active: TimeLogDto[]
    /** Período ativo da tarefa (se houver). */
    timerOf: (taskId: string) => TimeLogDto | undefined
}

const TimerContext = createContext<TimerContextValue | null>(null)

/** Fora do provider (ex.: card no arraste, testes) os destaques de timer não aparecem. */
export function useTimer(): TimerContextValue | null {
    return useContext(TimerContext)
}

/**
 * Estado dos períodos ativos compartilhado pela página (cards, linhas, cabeçalho, página da tarefa
 * e Horas agênticas). **Somente leitura**: quem abre/fecha os apontamentos é o servidor, a partir da
 * mesa de trabalho.
 */
export function TimerProvider({ enabled = true, children }: { enabled?: boolean; children: ReactNode }) {
    const query = useActiveTimers(enabled)
    useTimeRealtime()
    const active = useMemo(() => query.data ?? [], [query.data])
    const byTask = useMemo(() => new Map(active.filter((log) => log.taskId).map((log) => [log.taskId, log])), [active])
    const value = useMemo<TimerContextValue>(() => ({ active, timerOf: (taskId) => byTask.get(taskId) }), [active, byTask])

    return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>
}
