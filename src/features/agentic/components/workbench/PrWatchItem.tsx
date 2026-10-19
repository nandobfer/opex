"use client"

import { useState } from "react"
import { format } from "date-fns"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlertTriangle, CheckCircle2, ChevronRight, Circle, Loader2, Radar, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TimelineItem } from "../../timeline"

type PrWatchTimelineItem = Extract<TimelineItem, { kind: "pr-watch" }>

const STEP_STYLE = {
    info: { icon: Circle, className: "text-muted-foreground" },
    success: { icon: CheckCircle2, className: "text-success" },
    warn: { icon: AlertTriangle, className: "text-warning" },
    error: { icon: XCircle, className: "text-destructive" },
} as const

const OUTCOME_CLASS = { idle: "text-muted-foreground", action: "text-primary", error: "text-destructive" } as const

/**
 * Verificação do PR na saída da mesa: passos ao vivo enquanto a rotina roda e, depois, o resumo.
 * A verificação em andamento e a mais recente ficam abertas; as anteriores, recolhidas.
 */
export function PrWatchItem({ item, latest = false }: { item: PrWatchTimelineItem; latest?: boolean }) {
    const reduceMotion = useReducedMotion()
    const running = item.outcome === null
    const [toggled, setToggled] = useState<boolean | null>(null)
    const open = toggled ?? (running || latest)
    const stepsId = `${item.key}-steps`

    return (
        <div className="rounded-md border border-border/60 bg-muted/20 text-xs">
            <button type="button" aria-expanded={open} aria-controls={stepsId} onClick={() => setToggled(!open)} className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left">
                <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.15 }} className="flex text-muted-foreground">
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </motion.span>
                <Radar className={cn("h-3.5 w-3.5 text-primary", running && "animate-pulse")} aria-hidden />
                <span className="font-semibold text-foreground">Verificação do PR #{item.prNumber}</span>
                <span className="text-muted-foreground">{format(new Date(item.startedAt), "HH:mm")}</span>
                <span className={cn("ml-auto flex items-center gap-1", running ? "text-muted-foreground" : OUTCOME_CLASS[item.outcome!])}>
                    {running ? (
                        <>
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> verificando…
                        </>
                    ) : (
                        item.summary
                    )}
                </span>
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.ol
                        id={stepsId}
                        key="steps"
                        initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="space-y-1 overflow-hidden px-3 pb-2"
                    >
                        {item.steps.map((step, index) => {
                            const style = STEP_STYLE[step.level]
                            const Icon = style.icon
                            return (
                                <motion.li key={`${step.ts}-${index}`} initial={reduceMotion ? false : { opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.15 }} className="flex items-start gap-2">
                                    <Icon className={cn("mt-0.5 h-3 w-3 shrink-0", style.className)} aria-hidden />
                                    <span className="font-mono tabular-nums text-muted-foreground">{format(new Date(step.ts), "HH:mm:ss")}</span>
                                    <span className={cn("whitespace-pre-wrap", step.level === "info" ? "text-foreground/90" : style.className)}>{step.text}</span>
                                </motion.li>
                            )
                        })}
                    </motion.ol>
                )}
            </AnimatePresence>
        </div>
    )
}
