"use client"

import { Checkbox } from "@/components/ui/checkbox"

export interface LegendItem {
    key: string
    label: string
    color: string
}

/** Legenda com uma caixa de seleção por linha para mostrar ou ocultar a série no gráfico. */
export function SelectableLegend({ id, items, selected, onToggle }: { id: string; items: readonly LegendItem[]; selected: ReadonlySet<string>; onToggle: (key: string, checked: boolean) => void }) {
    return (
        <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Linhas do gráfico">
            {items.map((item) => {
                const inputId = `${id}-${item.key}`
                return (
                    <li key={item.key} className="flex items-center gap-2 text-xs">
                        <Checkbox id={inputId} checked={selected.has(item.key)} onCheckedChange={(checked) => onToggle(item.key, checked)} aria-label={item.label} />
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden />
                        <label htmlFor={inputId} className="cursor-pointer text-muted-foreground">
                            {item.label}
                        </label>
                    </li>
                )
            })}
        </ul>
    )
}
