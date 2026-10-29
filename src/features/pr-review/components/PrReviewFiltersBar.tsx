"use client"

import type { Dispatch, SetStateAction } from "react"
import { Bot, CircleDot, FolderGit2, Gavel } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"
import { PR_REVIEW_STATE_OPTIONS, PR_REVIEW_TRIGGER_OPTIONS, PR_REVIEW_VERDICT_OPTIONS, type PrReviewFilters } from "../filters"

interface PrReviewFiltersBarProps {
    filters: PrReviewFilters
    setFilters: Dispatch<SetStateAction<PrReviewFilters>>
    onClear: () => void
    /** Revisões no recorte atual (contador do cartão de filtros). */
    total: number
    /** Repositórios acompanhados (opções do filtro Repositório). */
    repos: readonly { repo: string; projectName: string }[]
}

/**
 * Filtros da página Agente Revisor (`ListFilters`): busca, período e multiseleção de **Situação**,
 * **Veredito**, **Repositório** e **Origem**. Tudo vai à API, que faz o recorte.
 */
export function PrReviewFiltersBar({ filters, setFilters, onClear, total, repos }: PrReviewFiltersBarProps) {
    // Repositório filtrado que deixou de ser acompanhado continua como opção (para poder desmarcar).
    const repoOptions = [...repos.map((repo) => ({ value: repo.repo, label: `${repo.repo} · ${repo.projectName}` })), ...filters.repos.filter((repo) => !repos.some((item) => item.repo === repo)).map((repo) => ({ value: repo, label: repo }))]
    return (
        <ListFilters
            total={total}
            onClear={onClear}
            search={{ value: filters.q, onChange: (q) => setFilters((prev) => ({ ...prev, q })), placeholder: "Repositório, número, título ou autor do PR", label: "Busca" }}
            secondary={
                <>
                    <FilterGroup label="Repositório" className="min-w-[200px] flex-[1.5]">
                        <CadastroMultiSelect icon={FolderGit2} aria-label="Repositório" placeholder="Todos" options={repoOptions} selected={filters.repos} onSelect={(values) => setFilters((prev) => ({ ...prev, repos: values }))} searchable searchPlaceholder="Buscar repositório..." />
                    </FilterGroup>
                    <FilterGroup label="Origem" className="min-w-[160px] flex-1">
                        <CadastroMultiSelect icon={Bot} aria-label="Origem" placeholder="Todas" options={[...PR_REVIEW_TRIGGER_OPTIONS]} selected={filters.triggers} onSelect={(values) => setFilters((prev) => ({ ...prev, triggers: values as PrReviewFilters["triggers"] }))} />
                    </FilterGroup>
                    <FilterGroup label="Período" className="min-w-[220px] flex-[1.5]">
                        <PresetDateRangeFilter startDate={filters.from} endDate={filters.to} onChange={(next) => setFilters((prev) => ({ ...prev, from: next.startDate, to: next.endDate }))} />
                    </FilterGroup>
                </>
            }
        >
            <FilterGroup label="Situação" className="min-w-[160px] flex-1">
                <CadastroMultiSelect icon={CircleDot} aria-label="Situação" placeholder="Todas" options={[...PR_REVIEW_STATE_OPTIONS]} selected={filters.states} onSelect={(values) => setFilters((prev) => ({ ...prev, states: values as PrReviewFilters["states"] }))} />
            </FilterGroup>
            <FilterGroup label="Veredito" className="min-w-[160px] flex-1">
                <CadastroMultiSelect icon={Gavel} aria-label="Veredito" placeholder="Todos" options={[...PR_REVIEW_VERDICT_OPTIONS]} selected={filters.verdicts} onSelect={(values) => setFilters((prev) => ({ ...prev, verdicts: values as PrReviewFilters["verdicts"] }))} />
            </FilterGroup>
        </ListFilters>
    )
}
