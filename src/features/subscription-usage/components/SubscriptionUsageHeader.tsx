"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { cn } from "@/lib/utils"
import { formatUsageDate, formatUsageDateTime, formatUsagePercent, usageStatusLine } from "../cycle-logic"
import type { UsageHeaderView } from "../types"
import { USAGE_HEADER_ROW } from "./layout"

const TONE_CLASSES = { warning: "text-warning font-medium", destructive: "text-destructive font-medium", muted: "text-muted-foreground" } as const

/**
 * Cabeçalho no desenho do Console do OpenCode Go: o % do mês grande e, abaixo, "<rótulo> · Renova em 5 dez · No
 * ritmo atual, atinge o limite em 1 dez" (trecho final em âmbar). O valor em US$ (`aside`) fica discreto à direita.
 */
export function SubscriptionUsageHeader({ view, label, renewalTitle, aside }: { view: UsageHeaderView; label: string; renewalTitle?: string; aside?: ReactNode }) {
    const reduceMotion = useReducedMotion()
    const status = usageStatusLine(view)

    return (
        <div className={USAGE_HEADER_ROW}>
            <div className="min-w-0 space-y-1">
                <AnimatedNumber value={view.monthPercent ?? 0} formatter={(value) => formatUsagePercent(value)} className="block font-mono text-3xl font-semibold text-foreground tabular-nums" />
                <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                    <span>{label}</span>
                    {view.cycle && (
                        <>
                            <span aria-hidden>·</span>
                            <span title={renewalTitle ?? `Renova em ${formatUsageDateTime(view.cycle.endsAt)}`} data-usage-renewal>
                                Renova em {formatUsageDate(view.cycle.endsAt)}
                            </span>
                        </>
                    )}
                    <AnimatePresence mode="wait" initial={false}>
                        {status && (
                            <motion.span
                                key={status.text}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                                className="flex items-center gap-x-1.5"
                            >
                                <span aria-hidden>·</span>
                                <span className={cn(TONE_CLASSES[status.tone])} data-usage-status={status.tone}>
                                    {status.text}
                                </span>
                            </motion.span>
                        )}
                    </AnimatePresence>
                </p>
            </div>
            {aside}
        </div>
    )
}
