"use client"

import { UsageBar } from "./UsageBar"

/** Uma linha: a barra (com `percent`) ou só o texto (`emptyText`, ex.: "Sem swap", "lendo…"). */
export type UsageBarsItem = {
    key: string
    label: string
    dataAttributes?: Record<`data-${string}`, string>
} & ({ percent: number; ariaLabel: string; detail?: string; detailTitle?: string; emptyText?: never } | { emptyText: string; percent?: never })

/**
 * Linhas de consumo compartilhadas (`UsageBar`): as do painel "Servidor e quota" e as de uso dos
 * ambientes. Linha sem valor fica com o rótulo e o texto à direita, na mesma altura do rótulo da barra.
 */
export function UsageBars({ items, className }: { items: readonly UsageBarsItem[]; className?: string }) {
    return (
        <div className={className}>
            {items.map((item) =>
                item.emptyText !== undefined ? (
                    <div key={item.key} className="flex items-center justify-between gap-2 text-[11px]" {...item.dataAttributes}>
                        <span className="truncate text-muted-foreground">{item.label}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{item.emptyText}</span>
                    </div>
                ) : (
                    <UsageBar key={item.key} label={item.label} percent={item.percent} detail={item.detail} detailTitle={item.detailTitle} ariaLabel={item.ariaLabel} dataAttributes={item.dataAttributes} />
                ),
            )}
        </div>
    )
}
