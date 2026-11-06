"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { UsageBar } from "@/components/metrics/UsageBar"
import { USAGE_LEVEL_CLASSES } from "@/components/metrics/usage-level"
import { formatResetIn } from "../logic"
import type { QuotaLevel, QuotaWindowDto } from "../types"

/** Cores por faixa de uso (tokens do tema; as mesmas da `UsageBar`). */
export const QUOTA_LEVEL_CLASSES: Readonly<Record<QuotaLevel, { bar: string; text: string }>> = USAGE_LEVEL_CLASSES

interface QuotaWindowBarProps {
    providerName: string
    window: QuotaWindowDto
    now: number
    /** Substitui o rótulo da janela (ex.: "Anthropic · 5h" nas barras-resumo). */
    label?: string
}

/** Uma janela da quota: rótulo, % usado animado, barra colorida pelo consumo e o tempo até o reset (`UsageBar`). */
export function QuotaWindowBar({ providerName, window, now, label: labelOverride }: QuotaWindowBarProps) {
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
    const label = `${labelOverride ?? `${providerName} ${window.label}`}: ${used}% usado${resetIn ? `, reinicia em ${resetIn}` : ""}`

    return <UsageBar label={text} percent={used} ariaLabel={label} detail={resetIn} detailTitle={resetTitle} dataAttributes={{ "data-quota-window": window.id }} />
}
