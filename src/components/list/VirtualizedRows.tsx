"use client"

import type { ReactNode } from "react"
import { usePageVirtualizer } from "@/hooks/usePageVirtualizer"

/** Acima disto a lista é virtualizada (regra do projeto: listas com mais de 50 itens). */
export const VIRTUALIZE_ABOVE = 50

interface VirtualizedRowsProps<T> {
    rows: readonly T[]
    rowKey: (row: T) => string
    renderRow: (row: T) => ReactNode
    /** Altura estimada de uma linha (as reais são medidas: linhas podem expandir). */
    estimateSize?: number
    rowClassName?: string
}

function PlainRows<T>({ rows, rowKey, renderRow, rowClassName }: VirtualizedRowsProps<T>) {
    return rows.map((row) => (
        <div key={rowKey(row)} role="listitem" className={rowClassName}>
            {renderRow(row)}
        </div>
    ))
}

function VirtualRows<T>({ rows, rowKey, renderRow, estimateSize = 60, rowClassName }: VirtualizedRowsProps<T>) {
    const { anchorRef, virtualizer, items, padTop, padBottom } = usePageVirtualizer({ count: rows.length, estimateSize })
    return (
        <div ref={anchorRef} style={{ paddingTop: padTop, paddingBottom: padBottom }}>
            {items.map((item) => {
                const row = rows[item.index]
                if (!row) return null
                return (
                    <div key={rowKey(row)} ref={virtualizer.measureElement} data-index={item.index} role="listitem" className={rowClassName}>
                        {renderRow(row)}
                    </div>
                )
            })}
        </div>
    )
}

/**
 * Linhas de uma lista em card: até 50 renderiza tudo; acima, virtualiza pela rolagem da página
 * (`usePageVirtualizer`, alturas medidas). Usado pelas contas e pelos recursos do OpenCode.
 */
export function VirtualizedRows<T>(props: VirtualizedRowsProps<T>) {
    return props.rows.length > VIRTUALIZE_ABOVE ? <VirtualRows {...props} /> : <PlainRows {...props} />
}
