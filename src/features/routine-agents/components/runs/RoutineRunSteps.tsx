"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, Hourglass, MessageSquareText, Moon, PlayCircle, ShieldAlert, Wrench } from "lucide-react"
import type { RoutineRunStepDto } from "../../types"
import { formatDuration, formatTime } from "../../format"

const ICONS = { text: MessageSquareText, tool: Wrench, wait: Hourglass, hibernate: Moon, confirmation: ShieldAlert, notice: AlertCircle, resume: PlayCircle } as const

/** Passos da execução (ao vivo, em ordem). */
export function RoutineRunSteps({ steps }: { steps: readonly RoutineRunStepDto[] }) {
    if (!steps.length) return <p className="text-xs text-muted-foreground">Nenhum passo registrado ainda.</p>
    return (
        <ol className="space-y-1.5" aria-label="Passos da execução">
            <AnimatePresence initial={false}>
                {steps.map((step) => {
                    const Icon = ICONS[step.kind] ?? Wrench
                    return (
                        <motion.li key={step.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.15 }} className="flex gap-2 text-xs">
                            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${step.error ? "text-destructive" : "text-muted-foreground"}`} aria-hidden />
                            <span className="min-w-0 flex-1">
                                <span className="font-medium">{step.label}</span>
                                {step.durationMs ? <span className="text-muted-foreground"> · {formatDuration(step.durationMs)}</span> : null}
                                {step.detail && <span className="block break-words text-muted-foreground">{step.detail}</span>}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatTime(step.at)}</span>
                        </motion.li>
                    )
                })}
            </AnimatePresence>
        </ol>
    )
}
