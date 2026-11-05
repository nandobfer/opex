"use client"

import { FilterGroup } from "@/components/list/FilterGroup"
import { OptionTabs } from "@/components/ui/option-tabs"
import { PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"

export interface MetricsPeriodValue<P extends string> {
    periodo: P
    de: string
    ate: string
}

/**
 * Período das métricas dentro de um `ListFilters`: abas (7/30/90 dias, 12 meses ou personalizado) e,
 * no personalizado, o intervalo. Compartilhado pelo `MetricsFiltersBar` (Visões gerais) e pela lista
 * `/agentes-rotineiros`.
 */
export function MetricsPeriodFilter<P extends string>({
    value,
    onChange,
    periods,
    customPeriod,
}: {
    value: MetricsPeriodValue<P>
    onChange: (patch: Partial<MetricsPeriodValue<P>>) => void
    periods: readonly { value: P; label: string }[]
    customPeriod: P
}) {
    return (
        <>
            <FilterGroup label="Período" className="min-w-[280px] flex-[2]">
                <OptionTabs<P> aria-label="Período" className="w-full" value={value.periodo} onChange={(periodo) => onChange({ periodo })} options={periods} />
            </FilterGroup>
            {value.periodo === customPeriod && (
                <FilterGroup label="Intervalo" className="min-w-[160px] flex-1">
                    <PresetDateRangeFilter startDate={value.de} endDate={value.ate} onChange={(next) => onChange({ de: next.startDate, ate: next.endDate })} emptyLabel="Escolha o intervalo" presets={[]} />
                </FilterGroup>
            )}
        </>
    )
}
