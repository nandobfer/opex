"use client"

import { Workflow } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import type { AgentCentralOption } from "../../types"

/**
 * Filtro "Central" das páginas do Adversário e do Mentor. Central filtrada que deixou de existir
 * continua como opção (pelo id), para poder desmarcar.
 */
export function CentralFilter({ centrals, selected, onSelect }: { centrals: readonly AgentCentralOption[]; selected: string[]; onSelect: (values: string[]) => void }) {
    const options = [...centrals.map((central) => ({ value: central.id, label: central.projectName })), ...selected.filter((id) => !centrals.some((central) => central.id === id)).map((id) => ({ value: id, label: id }))]
    return (
        <FilterGroup label="Central" className="min-w-[200px] flex-[1.5]">
            <CadastroMultiSelect icon={Workflow} aria-label="Central" placeholder="Todas" options={options} selected={selected} onSelect={onSelect} searchable searchPlaceholder="Buscar central..." />
        </FilterGroup>
    )
}
