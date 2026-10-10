"use client"

import type { SetStateAction } from "react"
import { Layers, RotateCcw } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { Button } from "@/components/ui/button"
import type { BoardColumnView } from "@/features/tasks/board"
import { DEFAULT_DEV_CENTER_FILTERS, type DevCenterFilters } from "../../dev-center-filters"

interface TaskFiltersProps {
    filters: DevCenterFilters
    columns: readonly BoardColumnView[]
    onChange: (next: SetStateAction<DevCenterFilters>) => void
    onReset: () => void
}

/** Colunas das tarefas da central. */
export function TaskFilters({ filters, columns, onChange, onReset }: TaskFiltersProps) {
    const changed = JSON.stringify(filters) !== JSON.stringify(DEFAULT_DEV_CENTER_FILTERS)
    return (
        <div className="flex gap-2">
            <CadastroMultiSelect
                className="min-w-0 flex-1"
                icon={Layers}
                placeholder="Colunas"
                options={columns.map((column) => ({ value: column.key, label: column.label }))}
                selected={filters.columns}
                onSelect={(values) => onChange((current) => ({ ...current, columns: values }))}
            />
            {changed && (
                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onReset} aria-label="Restaurar filtros" title="Restaurar filtros">
                    <RotateCcw className="h-4 w-4" aria-hidden />
                </Button>
            )}
        </div>
    )
}
