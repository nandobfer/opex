"use client"

import type { SetStateAction } from "react"
import { CircleDot, RotateCcw } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TASK_STATUS_LABELS, TASK_STATUSES } from "@/features/tasks/constants"
import { DEFAULT_DEV_CENTER_FILTERS, UNASSIGNED, type DevCenterFilters } from "../../dev-center-filters"

const ALL = "__all__"

interface TaskFiltersProps {
    filters: DevCenterFilters
    people: { id: string; name: string }[]
    onChange: (next: SetStateAction<DevCenterFilters>) => void
    onReset: () => void
}

/** Status (vários) e responsável das tarefas da central. */
export function TaskFilters({ filters, people, onChange, onReset }: TaskFiltersProps) {
    const changed = JSON.stringify(filters) !== JSON.stringify(DEFAULT_DEV_CENTER_FILTERS)
    return (
        <div className="flex gap-2">
            <CadastroMultiSelect
                className="min-w-0 flex-1"
                icon={CircleDot}
                placeholder="Status"
                options={TASK_STATUSES.map((status) => ({ value: status, label: TASK_STATUS_LABELS[status] }))}
                selected={filters.statuses}
                onSelect={(values) => onChange((current) => ({ ...current, statuses: TASK_STATUSES.filter((status) => values.includes(status)) }))}
            />
            <Select value={filters.assignee ?? ALL} onValueChange={(value) => onChange((current) => ({ ...current, assignee: value === ALL ? null : value }))}>
                <SelectTrigger className="min-w-0 flex-1" aria-label="Responsável">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={ALL}>Todos os responsáveis</SelectItem>
                    <SelectItem value={UNASSIGNED}>Sem responsável</SelectItem>
                    {people.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                            {person.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {changed && (
                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onReset} aria-label="Restaurar filtros" title="Restaurar filtros">
                    <RotateCcw className="h-4 w-4" aria-hidden />
                </Button>
            )}
        </div>
    )
}
