"use client"

import type { SetStateAction } from "react"
import { Layers } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import type { BoardColumnView } from "@/features/tasks/board"
import type { DevCenterFilters } from "../../dev-center-filters"

interface TaskFiltersProps {
    filters: DevCenterFilters
    columns: readonly BoardColumnView[]
    onChange: (next: SetStateAction<DevCenterFilters>) => void
}

/** Filtro de colunas das tarefas da central, ocupando a linha inteira. */
export function TaskFilters({ filters, columns, onChange }: TaskFiltersProps) {
    return (
        <CadastroMultiSelect
            icon={Layers}
            placeholder="Colunas"
            options={columns.map((column) => ({ value: column.key, label: column.label }))}
            selected={filters.columns}
            onSelect={(values) => onChange((current) => ({ ...current, columns: values }))}
        />
    )
}
