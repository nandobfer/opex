"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { cn } from "@/lib/utils"
import { formatGoDate, formatGoDateTime, formatGoPercent, formatGoUsd } from "../../go-logic"
import type { OpencodeGoUsageDto } from "../../go-types"
import { GO_HEADER_ROW } from "./layout"

/** Trecho final da linha de status: limite atingido, data em que o ritmo atual atinge o teto ou o % previsto. */
export function goStatusLine(data: OpencodeGoUsageDto): { text: string; tone: "warning" | "destructive" | "muted" } | null {
    if (data.limitReached) return { text: "Limite mensal atingido", tone: "destructive" }
    if (data.forecast?.crossesAt) return { text: `No ritmo atual, atinge o limite em ${formatGoDate(data.forecast.crossesAt)}`, tone: "warning" }
    if (data.forecast?.projectedPercent !== null && data.forecast?.projectedPercent !== undefined) return { text: `Previsão de ${formatGoPercent(data.forecast.projectedPercent)} até a renovação`, tone: "muted" }
    return null
}

/** Dica do "Renova em": data e hora e, na soma de assinaturas com ciclos diferentes, de qual chave é o ciclo (OPE-180). */
export function goRenewalTitle(data: OpencodeGoUsageDto): string | undefined {
    if (!data.cycle) return undefined
    const base = `Renova em ${formatGoDateTime(data.cycle.endsAt)}`
    return data.scope?.cyclesDiffer && data.scope.cycleKeyName ? `${base} — renovação mais próxima entre as assinaturas somadas (chave ${data.scope.cycleKeyName})` : base
}

const TONE_CLASSES = { warning: "text-warning font-medium", destructive: "text-destructive font-medium", muted: "text-muted-foreground" } as const

/**
 * Cabeçalho no desenho do Console: o % do mês grande e, abaixo, "Uso do Go · Renova em 5 dez · No ritmo atual,
 * atinge o limite em 1 dez" (trecho final em âmbar). O gasto real do ciclo fica discreto à direita.
 */
export function GoUsageHeader({ data }: { data: OpencodeGoUsageDto }) {
    const reduceMotion = useReducedMotion()
    const status = goStatusLine(data)

    return (
        <div className={GO_HEADER_ROW}>
            <div className="min-w-0 space-y-1">
                <AnimatedNumber value={data.monthPercent ?? 0} formatter={(value) => formatGoPercent(value)} className="block font-mono text-3xl font-semibold text-foreground tabular-nums" />
                <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                    <span>Uso do Go</span>
                    {data.cycle && (
                        <>
                            <span aria-hidden>·</span>
                            <span title={goRenewalTitle(data)} data-go-renewal>
                                Renova em {formatGoDate(data.cycle.endsAt)}
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
                                <span className={cn(TONE_CLASSES[status.tone])} data-go-status={status.tone}>
                                    {status.text}
                                </span>
                            </motion.span>
                        )}
                    </AnimatePresence>
                </p>
            </div>
            {data.realCostUsd !== null && (
                <p className="pt-1 text-[11px] text-muted-foreground" title="Soma do custo real por dia (usage/cost-by-day) desde o início do ciclo. Não é o medidor da assinatura, que normaliza o custo pela cota de cada modelo.">
                    Gasto real no ciclo: {formatGoUsd(data.realCostUsd)}
                    {data.realCostPartial && <span data-go-cost-partial> (parcial: o gasto de alguma assinatura não pôde ser lido)</span>}
                </p>
            )}
        </div>
    )
}
