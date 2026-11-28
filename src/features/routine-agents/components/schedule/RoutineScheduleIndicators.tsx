"use client"

import { AnimatePresence, motion } from "framer-motion"
import { CalendarCheck, CalendarClock, Hand, PauseCircle, Repeat, Timer, Webhook, type LucideIcon } from "lucide-react"
import { useNow } from "@/hooks/useNow"
import { cn } from "@/lib/utils"
import { routineScheduleSummary, type RoutineScheduleChip } from "../../schedule-summary"
import type { RoutineAgentDto } from "../../types"

const CHIP_ICONS: Record<RoutineScheduleChip["kind"], LucideIcon> = {
    interval: Repeat,
    daily: CalendarClock,
    weekly: CalendarClock,
    once: CalendarCheck,
    webhook: Webhook,
    manual: Hand,
}

/**
 * Gatilhos ligados e a próxima execução do agente (OPE-213), na lista `/agentes-rotineiros` e na página do agente.
 * O "em 2 h" se atualiza a cada minuto.
 */
export function RoutineScheduleIndicators({ agent, className }: { agent: Pick<RoutineAgentDto, "status" | "schedule" | "nextFireAt">; className?: string }) {
    const now = useNow(60_000)
    const summary = routineScheduleSummary(agent, now)
    return (
        <div className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)} data-testid="routine-schedule">
            {summary.chips.map((chip) => {
                const Icon = CHIP_ICONS[chip.kind]
                return (
                    <span key={chip.id} className="inline-flex items-center gap-1 rounded-full border bg-background/40 px-2 py-0.5 text-muted-foreground" title={chip.title} data-trigger={chip.kind}>
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {chip.label}
                    </span>
                )
            })}
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={summary.next.tone}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", summary.next.tone === "scheduled" ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground")}
                    data-testid="routine-next-run"
                    data-tone={summary.next.tone}
                >
                    {summary.next.tone === "paused" ? <PauseCircle className="h-3.5 w-3.5" aria-hidden /> : <Timer className="h-3.5 w-3.5" aria-hidden />}
                    {summary.next.label}
                </motion.span>
            </AnimatePresence>
        </div>
    )
}
