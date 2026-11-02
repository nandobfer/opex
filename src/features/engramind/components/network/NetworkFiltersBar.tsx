"use client"

import { useCallback, useMemo } from "react"
import { ListFilters } from "@/components/list/ListFilters"
import { activeNetworkFilterChips } from "../../network/filters"
import { NetworkFilterFields, type NetworkFilterFieldsProps } from "./NetworkFiltersSheet"

/**
 * Computador: busca e filtros da rede no cartão recolhível de `/tarefas` (`ListFilters`), com os chips
 * dos filtros ativos no resumo. A busca roda sozinha depois da espera de digitação.
 */
export function NetworkFiltersBar({ filters, onFilters, options, onClear, total }: NetworkFilterFieldsProps & { onClear: () => void; total: number }) {
    const chips = useMemo(() => activeNetworkFilterChips(filters).map((chip) => ({ key: chip.key, label: chip.label, onRemove: () => onFilters(chip.remove) })), [filters, onFilters])
    const onSearch = useCallback((search: string) => onFilters({ search }), [onFilters])
    return (
        <ListFilters
            collapsible
            chips={chips}
            total={total}
            search={{ value: filters.search, onChange: onSearch, placeholder: "Buscar por sentido e por texto", label: "Buscar memórias" }}
            onClear={onClear}
            secondary={<NetworkFilterFields filters={filters} onFilters={onFilters} options={options} part="secondary" />}
        >
            <NetworkFilterFields filters={filters} onFilters={onFilters} options={options} part="primary" />
        </ListFilters>
    )
}
