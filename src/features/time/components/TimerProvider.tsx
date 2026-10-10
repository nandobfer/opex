"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { apiErrorMessage } from "@/lib/api"
import type { TimeLogDto } from "../types"
import { useActiveTimers, useStartTimer, useStopTimer, useTimeRealtime } from "../hooks/useTime"
import { StopTimerDialog } from "./StopTimerDialog"

/** Tarefa que pode ter timer (o mínimo do card/linha/página). */
export interface TimerTask {
    id: string
    code: string
    title: string
}

interface TimerContextValue {
    active: TimeLogDto[]
    /** Timer ativo da tarefa (se houver). */
    timerOf: (taskId: string) => TimeLogDto | undefined
    /** Tarefa iniciando ou parando agora. */
    busyTaskId: string | null
    /**
     * Inicia o timer. Um por vez: com outro rodando, abre o modal de parar o atual e, ao
     * confirmar, inicia este.
     */
    start: (task: TimerTask) => void
    /** Abre o modal "Parar timer". */
    requestStop: (log: TimeLogDto) => void
}

const TimerContext = createContext<TimerContextValue | null>(null)

/** Fora do provider (ex.: card no arraste, testes) os botões de timer não aparecem. */
export function useTimer(): TimerContextValue | null {
    return useContext(TimerContext)
}

interface StopRequest {
    log: TimeLogDto
    /** Iniciar esta tarefa depois de parar (troca de timer). */
    then: TimerTask | null
}

/**
 * Estado dos timers compartilhado pela página (cards, linhas, cabeçalho, página da
 * tarefa e Minhas horas) e o único modal "Parar timer".
 */
export function TimerProvider({ enabled = true, children }: { enabled?: boolean; children: ReactNode }) {
    const query = useActiveTimers(enabled)
    useTimeRealtime()
    const startMutation = useStartTimer()
    const stopMutation = useStopTimer()
    const [request, setRequest] = useState<StopRequest | null>(null)
    const [error, setError] = useState<string | null>(null)

    const active = useMemo(() => query.data ?? [], [query.data])
    const byTask = useMemo(() => new Map(active.filter((log) => log.taskId).map((log) => [log.taskId!, log])), [active])

    const startNow = useCallback((task: TimerTask) => startMutation.mutate({ taskId: task.id, taskCode: task.code, taskTitle: task.title }), [startMutation])

    const start = useCallback(
        (task: TimerTask) => {
            if (byTask.has(task.id)) return
            const running = active.find((log) => !log.id.startsWith("pending-"))
            if (running) {
                setError(null)
                setRequest({ log: running, then: task })
                return
            }
            startNow(task)
        },
        [active, byTask, startNow],
    )

    const requestStop = useCallback((log: TimeLogDto) => {
        if (log.id.startsWith("pending-")) return
        setError(null)
        setRequest({ log, then: null })
    }, [])

    const confirm = useCallback(
        async (input: { description?: string; startTime?: string; endTime?: string }) => {
            if (!request) return
            try {
                await stopMutation.mutateAsync({ log: request.log, ...input })
                const next = request.then
                setRequest(null)
                setError(null)
                if (next) startNow(next)
            } catch (failure) {
                setError(apiErrorMessage(failure, "Não foi possível parar o timer"))
            }
        },
        [request, stopMutation, startNow],
    )

    const busyTaskId = startMutation.isPending ? (startMutation.variables?.taskId ?? null) : stopMutation.isPending ? (stopMutation.variables?.log.taskId ?? null) : null

    const value = useMemo<TimerContextValue>(
        () => ({ active, timerOf: (taskId) => byTask.get(taskId), busyTaskId, start, requestStop }),
        [active, byTask, busyTaskId, start, requestStop],
    )

    return (
        <TimerContext.Provider value={value}>
            {children}
            <StopTimerDialog
                log={request?.log ?? null}
                next={request?.then ?? null}
                submitting={stopMutation.isPending}
                error={error}
                onConfirm={confirm}
                onCancel={() => {
                    if (stopMutation.isPending) return
                    setRequest(null)
                    setError(null)
                }}
            />
        </TimerContext.Provider>
    )
}
