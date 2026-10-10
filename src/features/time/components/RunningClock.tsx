"use client"

import { useNow } from "@/hooks/useNow"
import { cn } from "@/lib/utils"
import { elapsedSeconds, formatClock } from "../format"
import { useTimer } from "./TimerProvider"

/** Cronômetro ao vivo de um período ativo (somente leitura). */
export function RunningClock({ startTime, className }: { startTime: string; className?: string }) {
    const now = useNow(1000)
    return <span className={cn("font-mono tabular-nums", className)}>{formatClock(elapsedSeconds(startTime, now))}</span>
}

/** Período ativo da tarefa (se houver) — para o destaque do card/linha. */
export function useRunningTimer(taskId: string) {
    return useTimer()?.timerOf(taskId)
}
