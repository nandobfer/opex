"use client"

import type { SetStateAction } from "react"
import { Activity, Layers } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import type { BoardColumnView } from "@/features/tasks/board"
import { DEV_CENTER_STATES, DEV_CENTER_STATE_LABELS, devCenterFiltersSchema, type DevCenterFilters } from "../../dev-center-filters"

interface TaskFiltersProps {
    filters: DevCenterFilters
    columns: readonly BoardColumnView[]
    onChange: (next: SetStateAction<DevCenterFilters>) => void
}

const STATE_OPTIONS = DEV_CENTER_STATES.map((state) => ({ value: state, label: DEV_CENTER_STATE_LABELS[state] }))
const statesSchema = devCenterFiltersSchema.shape.states

/** Filtros de colunas (com "Todos") e de estado da mesa das tarefas da central, cada um na linha inteira. */
export function TaskFilters({ filters, columns, onChange }: TaskFiltersProps) {
    return (
        <>
            <CadastroMultiSelect
                icon={Layers}
                placeholder="Colunas"
                options={columns.map((column) => ({ value: column.key, label: column.label }))}
                selected={(filters.allColumns ?? filters.columns.length === 0) ? columns.map((column) => column.key) : filters.columns}
                onSelect={(values) => onChange((current) => ({ ...current, columns: values, allColumns: values.length > 0 && values.length === columns.length }))}
                selectAllLabel="Todos"
            />
            <CadastroMultiSelect
                icon={Activity}
                placeholder="Estado da mesa"
                options={STATE_OPTIONS}
                selected={filters.states}
                onSelect={(values) => onChange((current) => ({ ...current, states: statesSchema.parse(values) }))}
            />
        </>
    )
}
