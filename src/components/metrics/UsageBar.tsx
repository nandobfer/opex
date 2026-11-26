"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { cn } from "@/lib/utils"
import { USAGE_LEVEL_CLASSES, USAGE_PULSE_PERCENT, usageLevel } from "./usage-level"

/** % inteiro (padrão) ou com casas decimais em pt-BR (ex.: 43,9%). */
const percentFormatter = (fractionDigits: number) => (value: number) =>
    fractionDigits > 0 ? `${value.toLocaleString("pt-BR", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}%` : `${Math.round(value)}%`

/** Cor fixa da primária (progresso que não é consumo, ex.: deploy), sem faixa nem pulso. */
const PRIMARY_CLASSES = { bar: "bg-primary", text: "text-primary" }

interface UsageBarProps {
    /** Rótulo à esquerda (ex.: "5h", "RAM"). */
    label: ReactNode
    /** Percentual usado (0–100); `null` = indeterminado (sem % e segmento correndo pela trilha). */
    percent: number | null
    /** Nome acessível da barra de progresso. */
    ariaLabel: string
    /** Texto do valor para leitores de tela (`aria-valuetext`). */
    ariaValueText?: string
    /** Texto pequeno antes do % (ex.: tempo até o reset, "usado / total"). */
    detail?: ReactNode
    detailTitle?: string
    /** Atributos de teste/estado no contêiner (ex.: `data-quota-window`). */
    dataAttributes?: Record<`data-${string}`, string>
    /** Casas decimais do % exibido (padrão 0, inteiro). */
    fractionDigits?: number
    /** `level` (padrão): cores pela faixa de consumo; `primary`: cor primária fixa, sem pulso. */
    tone?: "level" | "primary"
}

/**
 * Barra de consumo compartilhada (quota do OpenCode e recursos do servidor): rótulo, detalhe e %
 * animado à direita, barra colorida pela faixa (`usageLevel`), largura animada com Framer Motion e
 * pulso no vermelho a partir de 95% — sem animação com movimento reduzido. Também serve a progresso
 * (`tone="primary"`), inclusive indeterminado (`percent={null}`).
 */
export function UsageBar({ label, percent, ariaLabel, ariaValueText, detail, detailTitle, dataAttributes, fractionDigits = 0, tone = "level" }: UsageBarProps) {
    const reduceMotion = useReducedMotion()
    const indeterminate = percent === null
    const used = indeterminate ? 0 : Math.min(100, Math.max(0, percent))
    const level = usageLevel(used)
    const colors = tone === "primary" ? PRIMARY_CLASSES : USAGE_LEVEL_CLASSES[level]
    const pulse = tone === "level" && level === "critical" && used >= USAGE_PULSE_PERCENT && !reduceMotion
    const stateAttributes = tone === "level" ? { "data-level": level } : { "data-tone": tone }

    return (
        <div className="space-y-1" {...stateAttributes} data-indeterminate={indeterminate ? "true" : undefined} {...dataAttributes}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="truncate text-muted-foreground">{label}</span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                    {detail !== undefined && detail !== null && (
                        <span className="text-[10px] text-muted-foreground" title={detailTitle}>
                            {detail}
                        </span>
                    )}
                    {!indeterminate && <AnimatedNumber value={used} formatter={percentFormatter(fractionDigits)} className={cn("font-mono font-semibold tabular-nums transition-colors duration-300", colors.text)} />}
                </span>
            </div>
            <div
                role="progressbar"
                aria-label={ariaLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={indeterminate ? undefined : Math.round(used)}
                aria-valuetext={ariaValueText}
                className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
                {indeterminate ? (
                    <motion.div
                        data-indeterminate-bar
                        className={cn("absolute inset-y-0 w-[30%] rounded-full", colors.bar)}
                        initial={{ left: reduceMotion ? "35%" : "-30%" }}
                        animate={{ left: reduceMotion ? "35%" : ["-30%", "100%"] }}
                        transition={reduceMotion ? { duration: 0 } : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                    />
                ) : (
                    <motion.div
                        className={cn("h-full rounded-full transition-colors duration-300", colors.bar)}
                        initial={{ width: 0 }}
                        animate={{ width: `${used}%`, opacity: pulse ? [1, 0.55, 1] : 1 }}
                        transition={{
                            width: { duration: reduceMotion ? 0 : 0.6, ease: "easeOut" },
                            opacity: pulse ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 },
                        }}
                    />
                )}
            </div>
        </div>
    )
}
