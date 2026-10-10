"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Loader2, Pause, Play } from "lucide-react"
import { useNow } from "@/hooks/useNow"
import { cn } from "@/lib/utils"
import { elapsedSeconds, formatClock } from "../format"
import { useTimer, type TimerTask } from "./TimerProvider"

/** Cronômetro ao vivo de um timer ativo. */
export function RunningClock({ startTime, className }: { startTime: string; className?: string }) {
    const now = useNow(1000)
    return <span className={cn("font-mono tabular-nums", className)}>{formatClock(elapsedSeconds(startTime, now))}</span>
}

interface TimerButtonProps {
    task: TimerTask
    size?: "sm" | "md"
    /** Mostra o texto ("Iniciar"/"Parar") ao lado do ícone. */
    withLabel?: boolean
    className?: string
}

/**
 * ▶ inicia / ⏸ abre o modal de parar o timer da tarefa. Não propaga clique nem
 * ponteiro: dentro de card/linha não abre a tarefa nem começa o arraste. Fora do `TimerProvider`
 * não aparece.
 */
export function TimerButton({ task, size = "sm", withLabel = false, className }: TimerButtonProps) {
    const timer = useTimer()
    if (!timer) return null
    const running = timer.timerOf(task.id)
    const busy = timer.busyTaskId === task.id
    const pending = running?.id.startsWith("pending-") ?? false
    const label = running ? `Parar o timer de ${task.code}` : `Iniciar o timer de ${task.code}`
    const Icon = busy || pending ? Loader2 : running ? Pause : Play

    return (
        <motion.button
            type="button"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            disabled={busy || pending}
            onClick={(event) => {
                event.stopPropagation()
                if (running) timer.requestStop(running)
                else timer.start(task)
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label={label}
            title={label}
            className={cn(
                "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70",
                size === "sm" ? "h-6 min-w-6 px-1" : "h-9 px-3 text-sm",
                running ? "border-success/50 bg-success/15 text-success hover:bg-success/25" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary",
                className,
            )}
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.span key={running ? "stop" : "play"} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.12 }} className="inline-flex">
                    <Icon className={cn(size === "sm" ? "h-3 w-3" : "h-4 w-4", (busy || pending) && "animate-spin")} aria-hidden />
                </motion.span>
            </AnimatePresence>
            {withLabel && <span>{running ? "Parar" : "Iniciar trabalho"}</span>}
        </motion.button>
    )
}

/** Tarefa com timer rodando agora (para o destaque do card/linha). */
export function useRunningTimer(taskId: string) {
    return useTimer()?.timerOf(taskId)
}
