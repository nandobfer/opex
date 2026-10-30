"use client"

import type { Dispatch, SetStateAction } from "react"
import { CircleDot, MessageSquare, Radar } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"
import { MENTOR_SOURCE_OPTIONS, MENTOR_STATUS_OPTIONS, MENTOR_TRIGGER_OPTIONS, type MentorRunFilters } from "../../mentor/filters"
import type { AgentCentralOption } from "../../types"
import { CentralFilter } from "../page/CentralFilter"

interface MentorFiltersBarProps {
    filters: MentorRunFilters
    setFilters: Dispatch<SetStateAction<MentorRunFilters>>
    onClear: () => void
    /** Execuções no recorte atual (contador do cartão de filtros). */
    total: number
    centrals: readonly AgentCentralOption[]
}

/**
 * Filtros da página Agente Mentor (`ListFilters`): busca, período e multiseleção de **Situação**,
 * **Origem**, **Gatilho** e **Central**. Tudo vai à API, que faz o recorte.
 */
export function MentorFiltersBar({ filters, setFilters, onClear, total, centrals }: MentorFiltersBarProps) {
    return (
        <ListFilters
            total={total}
            onClear={onClear}
            search={{ value: filters.q, onChange: (q) => setFilters((prev) => ({ ...prev, q })), placeholder: "Código ou título da tarefa", label: "Busca" }}
            secondary={
                <>
                    <CentralFilter centrals={centrals} selected={filters.centrals} onSelect={(values) => setFilters((prev) => ({ ...prev, centrals: values }))} />
                    <FilterGroup label="Gatilho" className="min-w-[180px] flex-1">
                        <CadastroMultiSelect icon={MessageSquare} aria-label="Gatilho" placeholder="Todos" options={[...MENTOR_TRIGGER_OPTIONS]} selected={filters.triggers} onSelect={(values) => setFilters((prev) => ({ ...prev, triggers: values as MentorRunFilters["triggers"] }))} />
                    </FilterGroup>
                    <FilterGroup label="Período" className="min-w-[220px] flex-[1.5]">
                        <PresetDateRangeFilter startDate={filters.from} endDate={filters.to} onChange={(next) => setFilters((prev) => ({ ...prev, from: next.startDate, to: next.endDate }))} />
                    </FilterGroup>
                </>
            }
        >
            <FilterGroup label="Situação" className="min-w-[160px] flex-1">
                <CadastroMultiSelect icon={CircleDot} aria-label="Situação" placeholder="Todas" options={[...MENTOR_STATUS_OPTIONS]} selected={filters.statuses} onSelect={(values) => setFilters((prev) => ({ ...prev, statuses: values as MentorRunFilters["statuses"] }))} />
            </FilterGroup>
            <FilterGroup label="Origem" className="min-w-[160px] flex-1">
                <CadastroMultiSelect icon={Radar} aria-label="Origem" placeholder="Todas" options={[...MENTOR_SOURCE_OPTIONS]} selected={filters.sources} onSelect={(values) => setFilters((prev) => ({ ...prev, sources: values as MentorRunFilters["sources"] }))} />
            </FilterGroup>
        </ListFilters>
    )
}
