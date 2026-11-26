"use client"

import type { Dispatch, SetStateAction } from "react"
import { ListChecks, MessagesSquare } from "lucide-react"
import { CadastroSearchPicker } from "@/components/list/CadastroSearchPicker"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { DECISION_OPTIONS, type DecisionFilters } from "../../decision-filters"

interface DecisionsFiltersBarProps {
    filters: DecisionFilters
    setFilters: Dispatch<SetStateAction<DecisionFilters>>
    onClear: () => void
    total: number
    contacts: EvolutionContactDto[]
}

/**
 * Filtros da aba Decisões: **Conversa** (com busca, escolhidos no topo), **Decisão** e **Período**. Sem campo de busca
 * próprio (decisão do dono D10, 26/11/2026).
 */
export function DecisionsFiltersBar({ filters, setFilters, onClear, total, contacts }: DecisionsFiltersBarProps) {
    // Conversa filtrada que saiu do cache continua como opção (para poder desmarcar).
    const known = new Set(contacts.map((contact) => contact.jid))
    const conversationOptions = [
        ...contacts.map((contact) => ({ value: contact.jid, label: contact.name, description: contact.isGroup ? "Grupo" : (contact.number ?? undefined) })),
        ...filters.conversas.filter((jid) => !known.has(jid)).map((jid) => ({ value: jid, label: jid.split("@")[0] ?? jid })),
    ]
    return (
        <ListFilters total={total} onClear={onClear}>
            <FilterGroup label="Conversa" className="min-w-[200px] flex-[1.5]">
                <CadastroSearchPicker icon={MessagesSquare} aria-label="Conversa" placeholder="Todas" searchPlaceholder="Buscar por nome ou número" pluralNoun="conversas" pinSelected options={conversationOptions} selected={filters.conversas} onSelect={(values) => setFilters((prev) => ({ ...prev, conversas: values }))} />
            </FilterGroup>
            <FilterGroup label="Decisão" className="min-w-[180px] flex-1">
                <CadastroSearchPicker icon={ListChecks} aria-label="Decisão" placeholder="Todas" searchPlaceholder="Buscar decisão" pluralNoun="decisões" options={DECISION_OPTIONS} selected={filters.decisoes} onSelect={(values) => setFilters((prev) => ({ ...prev, decisoes: values as DecisionFilters["decisoes"] }))} />
            </FilterGroup>
            <FilterGroup label="Período" className="min-w-[220px] flex-[1.5]">
                <PresetDateRangeFilter startDate={filters.de} endDate={filters.ate} onChange={(next) => setFilters((prev) => ({ ...prev, de: next.startDate, ate: next.endDate }))} />
            </FilterGroup>
        </ListFilters>
    )
}
