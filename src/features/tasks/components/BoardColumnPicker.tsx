"use client"

import type { ReactNode } from "react"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import { columnDotStyle, type BoardColumnView } from "../board"
import { ColumnIconView } from "./column-icons"

interface BoardColumnPickerProps {
    id: string
    columns: readonly BoardColumnView[]
    value: string | null
    onChange: (key: string | null) => void
    loading?: boolean
    invalid?: boolean
    placeholder: string
    searchLabel: string
    /** Com o texto, oferece "sem coluna" no rodapé (ex.: coluna de conclusão opcional). */
    noneLabel?: string
}

/** Escolha de uma coluna do quadro de Tarefas (busca, ícone e cor da coluna) — vínculos do GitHub e bootstrap. */
export function BoardColumnPicker({ id, columns, value, onChange, loading, invalid, placeholder, searchLabel, noneLabel }: BoardColumnPickerProps) {
    const selected = columns.find((column) => column.key === value)
    const label = (column: BoardColumnView): ReactNode => (
        <span className="flex items-center gap-2">
            <ColumnIconView icon={column.column.icon} className="h-3.5 w-3.5 text-muted-foreground" />
            {column.label}
        </span>
    )
    return (
        <SearchPicker
            trigger={<FieldTrigger id={id} placeholder={placeholder} invalid={invalid} value={selected ? label(selected) : undefined} />}
            items={columns}
            getKey={(item) => item.key}
            searchKeys={["label"]}
            renderItem={(item) => (
                <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={columnDotStyle(item)} aria-hidden />
                    <ColumnIconView icon={item.column.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                    {item.label}
                </span>
            )}
            onPick={(item) => onChange(item.key)}
            loading={loading}
            matchTriggerWidth
            searchLabel={searchLabel}
            listLabel="Colunas"
            emptyText="Nenhuma coluna: crie uma no quadro de Tarefas"
            emptySearchText="Nenhuma coluna encontrada"
            footer={
                noneLabel ? (
                    <button type="button" className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted" onClick={() => onChange(null)}>
                        {noneLabel}
                    </button>
                ) : undefined
            }
        />
    )
}
