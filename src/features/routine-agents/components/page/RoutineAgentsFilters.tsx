"use client"

import { CircleDot } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { MetricsPeriodFilter } from "@/components/metrics/MetricsPeriodFilter"
import { OptionTabs } from "@/components/ui/option-tabs"
import { METRICS_PERIOD_LABELS, METRICS_PERIODS } from "@/features/agent-metrics/period"
import { ROUTINE_LIST_STATUS_LABELS, ROUTINE_LIST_STATUSES, type RoutineListEngine, type RoutineListFilters } from "../../list-filters"

const PERIODS = METRICS_PERIODS.map((value) => ({ value, label: METRICS_PERIOD_LABELS[value] }))
const STATUS_OPTIONS = ROUTINE_LIST_STATUSES.map((value) => ({ value, label: ROUTINE_LIST_STATUS_LABELS[value] }))
const ENGINE_OPTIONS: { value: RoutineListEngine; label: string }[] = [
    { value: "all", label: "Todos" },
    { value: "opex", label: "Opex" },
    { value: "opencode", label: "OpenCode" },
]

/** Filtros da lista `/agentes-rotineiros` (padrão `ListFilters`): busca, status, motor e período (D18). */
export function RoutineAgentsFilters({ filters, total, onChange, onClear }: { filters: RoutineListFilters; total: number; onChange: (patch: Partial<RoutineListFilters>) => void; onClear: () => void }) {
    return (
        <ListFilters
            total={total}
            search={{ value: filters.busca, onChange: (busca) => onChange({ busca }), placeholder: "Buscar por nome ou objetivo...", label: "Buscar agente rotineiro" }}
            onClear={onClear}
            // Período (KPIs e gráfico das linhas) na segunda linha, para não espremer busca, status e motor.
            secondary={<MetricsPeriodFilter value={filters} onChange={onChange} periods={PERIODS} customPeriod="custom" />}
        >
            <FilterGroup label="Status" className="min-w-[180px] flex-1">
                <CadastroMultiSelect icon={CircleDot} placeholder="Todos" options={STATUS_OPTIONS} selected={filters.status} onSelect={(status) => onChange({ status })} aria-label="Status" />
            </FilterGroup>
            <FilterGroup label="Motor" className="min-w-[200px] flex-1">
                <OptionTabs<RoutineListEngine> aria-label="Motor" className="w-full" value={filters.motor} onChange={(motor) => onChange({ motor })} options={ENGINE_OPTIONS} />
            </FilterGroup>
        </ListFilters>
    )
}
