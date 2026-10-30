"use client"

import type { Dispatch, SetStateAction } from "react"
import { CircleDot, Gauge, Gavel } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"
import { ADVERSARIAL_DECISION_OPTIONS, ADVERSARIAL_LEVEL_OPTIONS, ADVERSARIAL_STATE_OPTIONS, type AdversarialReviewFilters } from "../../filters"
import type { AgentCentralOption } from "../../types"
import { CentralFilter } from "./CentralFilter"

interface AdversarialFiltersBarProps {
    filters: AdversarialReviewFilters
    setFilters: Dispatch<SetStateAction<AdversarialReviewFilters>>
    onClear: () => void
    /** Rodadas no recorte atual (contador do cartão de filtros). */
    total: number
    centrals: readonly AgentCentralOption[]
}

/**
 * Filtros da página Agente Adversário (`ListFilters`): busca, período e multiseleção de **Situação**,
 * **Decisão**, **Criticidade** e **Central**. Tudo vai à API, que faz o recorte.
 */
export function AdversarialFiltersBar({ filters, setFilters, onClear, total, centrals }: AdversarialFiltersBarProps) {
    return (
        <ListFilters
            total={total}
            onClear={onClear}
            search={{ value: filters.q, onChange: (q) => setFilters((prev) => ({ ...prev, q })), placeholder: "Código ou título da tarefa", label: "Busca" }}
            secondary={
                <>
                    <CentralFilter centrals={centrals} selected={filters.centrals} onSelect={(values) => setFilters((prev) => ({ ...prev, centrals: values }))} />
                    <FilterGroup label="Criticidade" className="min-w-[160px] flex-1">
                        <CadastroMultiSelect icon={Gauge} aria-label="Criticidade" placeholder="Todas" options={[...ADVERSARIAL_LEVEL_OPTIONS]} selected={filters.levels} onSelect={(values) => setFilters((prev) => ({ ...prev, levels: values as AdversarialReviewFilters["levels"] }))} />
                    </FilterGroup>
                    <FilterGroup label="Período" className="min-w-[220px] flex-[1.5]">
                        <PresetDateRangeFilter startDate={filters.from} endDate={filters.to} onChange={(next) => setFilters((prev) => ({ ...prev, from: next.startDate, to: next.endDate }))} />
                    </FilterGroup>
                </>
            }
        >
            <FilterGroup label="Situação" className="min-w-[160px] flex-1">
                <CadastroMultiSelect icon={CircleDot} aria-label="Situação" placeholder="Todas" options={[...ADVERSARIAL_STATE_OPTIONS]} selected={filters.states} onSelect={(values) => setFilters((prev) => ({ ...prev, states: values as AdversarialReviewFilters["states"] }))} />
            </FilterGroup>
            <FilterGroup label="Decisão" className="min-w-[160px] flex-1">
                <CadastroMultiSelect icon={Gavel} aria-label="Decisão" placeholder="Todas" options={[...ADVERSARIAL_DECISION_OPTIONS]} selected={filters.decisions} onSelect={(values) => setFilters((prev) => ({ ...prev, decisions: values as AdversarialReviewFilters["decisions"] }))} />
            </FilterGroup>
        </ListFilters>
    )
}
