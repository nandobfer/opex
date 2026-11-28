"use client"

import { UsageBar } from "./UsageBar"
import { USAGE_BAR_COMPACT_CLASS, USAGE_BAR_COMPACT_LABEL_CLASS, USAGE_BAR_COMPACT_TRACK_ROW_CLASS } from "./usage-bar-layout"

/** Uma linha: a barra (com `percent`) ou só o texto (`emptyText`, ex.: "Sem swap", "lendo…"). */
export type UsageBarsItem = {
    key: string
    label: string
    dataAttributes?: Record<`data-${string}`, string>
} & ({ percent: number; ariaLabel: string; detail?: string; detailTitle?: string; emptyText?: never } | { emptyText: string; percent?: never })

/**
 * Linhas de consumo compartilhadas (`UsageBar`): as do painel "Servidor e quota" e as de uso dos
 * ambientes. Linha sem valor fica com o rótulo e o texto à direita, na mesma altura do rótulo da barra.
 * `compact` (OPE-218): células curtas para ficarem lado a lado; o detalhe vai para o `title` e o texto sem
 * valor ocupa a faixa da trilha, com a mesma altura da célula com barra.
 */
export function UsageBars({ items, className, compact = false }: { items: readonly UsageBarsItem[]; className?: string; compact?: boolean }) {
    return (
        <div className={className}>
            {items.map((item) =>
                item.emptyText !== undefined && compact ? (
                    <div key={item.key} className={USAGE_BAR_COMPACT_CLASS} title={`${item.label}: ${item.emptyText}`} data-compact="true" {...item.dataAttributes}>
                        <div className={USAGE_BAR_COMPACT_LABEL_CLASS}>
                            <span className="truncate text-muted-foreground">{item.label}</span>
                        </div>
                        <div className={USAGE_BAR_COMPACT_TRACK_ROW_CLASS}>
                            <span className="truncate text-[10px] leading-none text-muted-foreground">{item.emptyText}</span>
                        </div>
                    </div>
                ) : item.emptyText !== undefined ? (
                    <div key={item.key} className="flex items-center justify-between gap-2 text-[11px]" {...item.dataAttributes}>
                        <span className="truncate text-muted-foreground">{item.label}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{item.emptyText}</span>
                    </div>
                ) : (
                    <UsageBar key={item.key} label={item.label} percent={item.percent} detail={item.detail} detailTitle={item.detailTitle} ariaLabel={item.ariaLabel} dataAttributes={item.dataAttributes} compact={compact} />
                ),
            )}
        </div>
    )
}
