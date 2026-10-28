"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { motion, useReducedMotion } from "framer-motion"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { cn } from "@/lib/utils"
import { formatResetIn, quotaLevel } from "../logic"
import type { QuotaLevel, QuotaWindowDto } from "../types"

/** Cores por faixa de uso (tokens do tema). */
export const QUOTA_LEVEL_CLASSES: Readonly<Record<QuotaLevel, { bar: string; text: string }>> = {
    ok: { bar: "bg-success", text: "text-success" },
    warning: { bar: "bg-warning", text: "text-warning" },
    critical: { bar: "bg-destructive", text: "text-destructive" },
}

const formatPercent = (value: number) => `${Math.round(value)}%`

interface QuotaWindowBarProps {
    providerName: string
    window: QuotaWindowDto
    now: number
    /** Substitui o rótulo da janela (ex.: "Anthropic · 5h" nas barras-resumo). */
    label?: string
}

/** Uma janela da quota: rótulo, % usado animado, barra colorida pelo consumo e o tempo até o reset. */
export function QuotaWindowBar({ providerName, window, now, label: labelOverride }: QuotaWindowBarProps) {
    const reduceMotion = useReducedMotion()
    const resetIn = window.resetAt ? formatResetIn(window.resetAt, now) : null
    const text = labelOverride ?? window.label
    const resetTitle = window.resetAt ? `Reinicia em ${format(new Date(window.resetAt), "dd/MM 'às' HH:mm", { locale: ptBR })}` : undefined

    if (window.usedPercent === null) {
        return (
            <div className="flex items-center justify-between gap-2 text-[11px]" data-quota-window={window.id}>
                <span className="truncate text-muted-foreground">{text}</span>
                <span className="shrink-0 font-mono text-foreground">{window.value}</span>
            </div>
        )
    }

    const used = window.usedPercent
    const level = quotaLevel(used)
    const colors = QUOTA_LEVEL_CLASSES[level]
    const label = `${labelOverride ?? `${providerName} ${window.label}`}: ${used}% usado${resetIn ? `, reinicia em ${resetIn}` : ""}`

    return (
        <div className="space-y-1" data-quota-window={window.id} data-level={level}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="truncate text-muted-foreground">{text}</span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                    {resetIn && (
                        <span className="text-[10px] text-muted-foreground" title={resetTitle}>
                            reinicia em {resetIn}
                        </span>
                    )}
                    <AnimatedNumber value={used} formatter={formatPercent} className={cn("font-mono font-semibold tabular-nums transition-colors duration-300", colors.text)} />
                </span>
            </div>
            <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={used} className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                    className={cn("h-full rounded-full transition-colors duration-300", colors.bar)}
                    initial={{ width: 0 }}
                    animate={{ width: `${used}%`, opacity: level === "critical" && used >= 95 && !reduceMotion ? [1, 0.55, 1] : 1 }}
                    transition={{
                        width: { duration: reduceMotion ? 0 : 0.6, ease: "easeOut" },
                        opacity: level === "critical" && used >= 95 && !reduceMotion ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 },
                    }}
                />
            </div>
        </div>
    )
}
