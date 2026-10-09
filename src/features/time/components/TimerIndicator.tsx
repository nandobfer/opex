"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Timer } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { TimeLogDto } from "../types"
import { RunningClock } from "./TimerButton"
import { useTimer } from "./TimerProvider"

/**
 * Indicador de trabalho em andamento (topo da página Tarefas): ícone girando + cronômetro. Clicar
 * abre o modal de parar; com vários timers (iniciados no go.sipal), lista para escolher.
 */
export function TimerIndicator() {
    const timer = useTimer()
    const active = (timer?.active ?? []).filter((log) => !log.id.startsWith("pending-"))
    const first = active[0]

    const body = first && (
        <>
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2.4, ease: "linear" }} className="inline-flex" aria-hidden>
                <Timer className="h-4 w-4" />
            </motion.span>
            <RunningClock startTime={first.startTime} className="text-xs font-semibold" />
            {active.length > 1 && <span className="rounded-full bg-success px-1.5 text-[10px] font-bold text-background">{active.length}</span>}
        </>
    )
    const className = "inline-flex h-9 items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 text-success transition-colors hover:bg-success/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success"

    return (
        <AnimatePresence initial={false}>
            {first && timer && (
                <motion.div key="timer-indicator" initial={{ opacity: 0, scale: 0.85, x: 8 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.85, x: 8 }} transition={{ duration: 0.2 }}>
                    {active.length === 1 ? (
                        <button type="button" onClick={() => timer.requestStop(first)} className={className} aria-label={`Trabalho em andamento em ${first.taskCode ?? first.taskTitle ?? "tarefa"}: parar`} title="Parar o timer">
                            {body}
                        </button>
                    ) : (
                        <Popover>
                            <PopoverTrigger className={className} aria-label={`${active.length} timers em andamento`}>
                                {body}
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-80 p-1">
                                <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Timers em andamento</p>
                                {active.map((log) => (
                                    <ActiveRow key={log.id} log={log} onStop={() => timer.requestStop(log)} />
                                ))}
                            </PopoverContent>
                        </Popover>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    )
}

function ActiveRow({ log, onStop }: { log: TimeLogDto; onStop: () => void }) {
    return (
        <button type="button" onClick={onStop} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-accent" aria-label={`Parar ${log.taskCode ?? log.taskTitle ?? "timer"}`}>
            <span className="min-w-0 flex-1">
                {log.taskCode && <span className="font-mono font-semibold text-primary">{log.taskCode} </span>}
                <span className="truncate">{log.taskTitle ?? "Sem tarefa"}</span>
            </span>
            <RunningClock startTime={log.startTime} className="text-success" />
        </button>
    )
}
