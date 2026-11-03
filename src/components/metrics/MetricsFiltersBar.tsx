"use client"

import type { ReactNode } from "react"
import { Building2, Github } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { OptionTabs } from "@/components/ui/option-tabs"
import { PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"

const COL = "min-w-[160px] flex-1"

export interface MetricsFilterValues<P extends string> {
    periodo: P
    de: string
    ate: string
    clientes: string[]
    repositorios: string[]
}

interface MetricsFiltersBarProps<P extends string> {
    filters: MetricsFilterValues<P>
    onChange: (patch: Partial<MetricsFilterValues<P>>) => void
    onClear: () => void
    periods: readonly { value: P; label: string }[]
    /** Valor de período que habilita o intervalo personalizado. */
    customPeriod: P
    clients: readonly { value: string; label: string }[] | null
    repos: readonly { value: string; label: string }[] | null
    renderRepoLabel?: (option: { value: string; label: string }) => ReactNode
    /** Campos extras do agente (ex.: margem do Orçamentista). */
    children?: ReactNode
}

/**
 * Filtros das Visões gerais (`ListFilters`, fundo do card): período (7/30/90 dias, 12 meses ou
 * personalizado), Clientes e Repositórios. `clients`/`repos` `null` = o filtro não se aplica ao agente
 * e fica oculto.
 */
export function MetricsFiltersBar<P extends string>({ filters, onChange, onClear, periods, customPeriod, clients, repos, renderRepoLabel, children }: MetricsFiltersBarProps<P>) {
    return (
        <ListFilters onClear={onClear}>
            <FilterGroup label="Período" className="min-w-[280px] flex-[2]">
                <OptionTabs<P> aria-label="Período" className="w-full" value={filters.periodo} onChange={(periodo) => onChange({ periodo })} options={periods} />
            </FilterGroup>
            {filters.periodo === customPeriod && (
                <FilterGroup label="Intervalo" className={COL}>
                    <PresetDateRangeFilter startDate={filters.de} endDate={filters.ate} onChange={(next) => onChange({ de: next.startDate, ate: next.endDate })} emptyLabel="Escolha o intervalo" presets={[]} />
                </FilterGroup>
            )}
            {clients && (
                <FilterGroup label="Clientes" className={COL}>
                    <CadastroMultiSelect icon={Building2} placeholder="Todos" options={[...clients]} selected={filters.clientes} onSelect={(clientes) => onChange({ clientes })} searchable searchPlaceholder="Buscar cliente..." aria-label="Clientes" />
                </FilterGroup>
            )}
            {repos && (
                <FilterGroup label="Repositórios" className={COL}>
                    <CadastroMultiSelect
                        icon={Github}
                        placeholder="Todos"
                        options={[...repos]}
                        renderLabel={renderRepoLabel}
                        selected={filters.repositorios}
                        onSelect={(repositorios) => onChange({ repositorios })}
                        searchable
                        searchPlaceholder="Buscar repositório..."
                        aria-label="Repositórios"
                    />
                </FilterGroup>
            )}
            {children}
        </ListFilters>
    )
}
