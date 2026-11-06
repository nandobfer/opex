"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { cn } from "@/lib/utils"
import { USAGE_LEVEL_CLASSES, USAGE_PULSE_PERCENT, usageLevel } from "./usage-level"

const formatPercent = (value: number) => `${Math.round(value)}%`

interface UsageBarProps {
    /** Rótulo à esquerda (ex.: "5h", "RAM"). */
    label: ReactNode
    /** Percentual usado (0–100). */
    percent: number
    /** Nome acessível da barra de progresso. */
    ariaLabel: string
    /** Texto pequeno antes do % (ex.: tempo até o reset, "usado / total"). */
    detail?: ReactNode
    detailTitle?: string
    /** Atributos de teste/estado no contêiner (ex.: `data-quota-window`). */
    dataAttributes?: Record<`data-${string}`, string>
}

/**
 * Barra de consumo compartilhada (quota do OpenCode e recursos do servidor): rótulo, detalhe e %
 * animado à direita, barra colorida pela faixa (`usageLevel`), largura animada com Framer Motion e
 * pulso no vermelho a partir de 95% — sem animação com movimento reduzido.
 */
export function UsageBar({ label, percent, ariaLabel, detail, detailTitle, dataAttributes }: UsageBarProps) {
    const reduceMotion = useReducedMotion()
    const used = Math.min(100, Math.max(0, percent))
    const level = usageLevel(used)
    const colors = USAGE_LEVEL_CLASSES[level]
    const pulse = level === "critical" && used >= USAGE_PULSE_PERCENT && !reduceMotion

    return (
        <div className="space-y-1" data-level={level} {...dataAttributes}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="truncate text-muted-foreground">{label}</span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                    {detail !== undefined && detail !== null && (
                        <span className="text-[10px] text-muted-foreground" title={detailTitle}>
                            {detail}
                        </span>
                    )}
                    <AnimatedNumber value={used} formatter={formatPercent} className={cn("font-mono font-semibold tabular-nums transition-colors duration-300", colors.text)} />
                </span>
            </div>
            <div role="progressbar" aria-label={ariaLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used)} className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                    className={cn("h-full rounded-full transition-colors duration-300", colors.bar)}
                    initial={{ width: 0 }}
                    animate={{ width: `${used}%`, opacity: pulse ? [1, 0.55, 1] : 1 }}
                    transition={{
                        width: { duration: reduceMotion ? 0 : 0.6, ease: "easeOut" },
                        opacity: pulse ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 },
                    }}
                />
            </div>
        </div>
    )
}
