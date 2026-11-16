"use client"

import { FilterGroup } from "@/components/list/FilterGroup"
import { PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"
import type { UsageKeyOption } from "../usage-key-filter"
import type { UsageRange } from "../hooks/useUsageRange"
import { USAGE_FILTERS_GRID, UsageKeySelect } from "./UsageKeySelect"

interface UsageFiltersBarProps {
    range: UsageRange
    onRangeChange: (next: UsageRange) => void
    /** Filtro "Chave de API" (provedores com chaveiro); `null` mostra só o período. */
    keyFilter: { value: string; options: UsageKeyOption[]; setValue: (value: string) => void } | null
}

/** Filtros dos painéis de consumo: período (padrão Último mês) e, com chaveiro, a chave de API — ambos na URL. */
export function UsageFiltersBar({ range, onRangeChange, keyFilter }: UsageFiltersBarProps) {
    return (
        <div className={keyFilter ? USAGE_FILTERS_GRID : undefined}>
            <FilterGroup label="Período">
                <PresetDateRangeFilter startDate={range.usageFrom} endDate={range.usageTo} onChange={(next) => onRangeChange({ usageFrom: next.startDate, usageTo: next.endDate })} />
            </FilterGroup>
            {keyFilter && <UsageKeySelect value={keyFilter.value} options={keyFilter.options} onChange={keyFilter.setValue} />}
        </div>
    )
}
