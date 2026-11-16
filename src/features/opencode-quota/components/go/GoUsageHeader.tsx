"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { USAGE_LEVEL_CLASSES, usageLevel } from "@/components/metrics/usage-level"
import { cn } from "@/lib/utils"
import { formatGoDate, formatGoDateTime, formatGoPercent, formatGoUsd } from "../../go-logic"
import type { OpencodeGoUsageDto } from "../../go-types"
import { GO_HEADER_ROW } from "./layout"

/** Linha de situação: limite atingido, data em que o ritmo atual atinge o teto ou o % previsto. */
export function goStatusLine(data: OpencodeGoUsageDto): { text: string; tone: "warning" | "destructive" | "muted" } | null {
    if (data.limitReached) return { text: "Limite mensal atingido", tone: "destructive" }
    if (data.forecast?.crossesAt) return { text: `No ritmo atual, atinge o limite em ${formatGoDate(data.forecast.crossesAt)}`, tone: "warning" }
    if (data.forecast?.projectedPercent !== null && data.forecast?.projectedPercent !== undefined) return { text: `Previsão de ${formatGoPercent(data.forecast.projectedPercent)} até a renovação`, tone: "muted" }
    return null
}

const TONE_CLASSES = { warning: "text-warning", destructive: "text-destructive", muted: "text-muted-foreground" } as const

/** Cabeçalho "Uso do Go · Renova em …": % do mês em destaque, situação e o gasto real do ciclo, discreto. */
export function GoUsageHeader({ data }: { data: OpencodeGoUsageDto }) {
    const reduceMotion = useReducedMotion()
    const percent = data.monthPercent ?? 0
    const status = goStatusLine(data)
    const renewal = data.cycle ? formatGoDateTime(data.cycle.endsAt) : null

    return (
        <div className={GO_HEADER_ROW}>
            <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">
                    Uso do Go{renewal && <> · Renova em <span className="text-foreground">{renewal}</span></>}
                </p>
                <AnimatePresence mode="wait" initial={false}>
                    {status && (
                        <motion.p
                            key={status.text}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            transition={{ duration: reduceMotion ? 0 : 0.2 }}
                            className={cn("text-sm font-medium", TONE_CLASSES[status.tone])}
                            data-go-status={status.tone}
                        >
                            {status.text}
                        </motion.p>
                    )}
                </AnimatePresence>
            </div>
            <div className="text-right">
                <AnimatedNumber
                    value={percent}
                    formatter={(value) => formatGoPercent(value)}
                    className={cn("font-mono text-3xl font-semibold tabular-nums transition-colors duration-300", USAGE_LEVEL_CLASSES[usageLevel(Math.min(100, percent))].text)}
                />
                <p className="text-xs text-muted-foreground">do mês usado</p>
                {data.realCostUsd !== null && (
                    <p className="text-[11px] text-muted-foreground" title="Soma do custo real por dia (usage/cost-by-day) desde o início do ciclo. Não é o medidor da assinatura, que normaliza o custo pela cota de cada modelo.">
                        Gasto real no ciclo: {formatGoUsd(data.realCostUsd)}
                    </p>
                )}
            </div>
        </div>
    )
}
