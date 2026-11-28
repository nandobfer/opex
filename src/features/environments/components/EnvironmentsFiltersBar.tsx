"use client"

import { Activity, Boxes, Server } from "lucide-react"
import { CadastroSearchPicker, type CadastroSearchPickerOption } from "@/components/list/CadastroSearchPicker"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { ENVIRONMENT_HEALTHS, ENVIRONMENT_ORIGINS, ORIGIN_LABELS, type EnvironmentFilters } from "../filters"
import { MACHINE_LABELS, MACHINES } from "../schemas"
import { HEALTH_LABELS } from "../view"

const MACHINE_OPTIONS: CadastroSearchPickerOption[] = MACHINES.map((value) => ({ value, label: MACHINE_LABELS[value] }))
const HEALTH_OPTIONS: CadastroSearchPickerOption[] = ENVIRONMENT_HEALTHS.map((value) => ({ value, label: HEALTH_LABELS[value] }))
const ORIGIN_OPTIONS: CadastroSearchPickerOption[] = ENVIRONMENT_ORIGINS.map((value) => ({ value, label: ORIGIN_LABELS[value] }))

/** Filtros da lista `/ambientes` (OPE-211): busca, máquina, situação e origem (gerenciados e não gerenciados). */
export function EnvironmentsFiltersBar({ filters, setFilters, onClear, total }: { filters: EnvironmentFilters; setFilters: (update: (prev: EnvironmentFilters) => EnvironmentFilters) => void; onClear: () => void; total: number }) {
    return (
        <ListFilters total={total} search={{ value: filters.q, onChange: (q) => setFilters((prev) => ({ ...prev, q })), placeholder: "Buscar por nome, serviço, porta ou pasta", label: "Busca" }} onClear={onClear}>
            <FilterGroup label="Máquina" className="min-w-[150px] flex-1">
                <CadastroSearchPicker icon={Server} aria-label="Máquina" pluralNoun="máquinas" searchPlaceholder="Buscar máquina..." options={MACHINE_OPTIONS} selected={filters.machines} onSelect={(values) => setFilters((prev) => ({ ...prev, machines: values as EnvironmentFilters["machines"] }))} />
            </FilterGroup>
            <FilterGroup label="Situação" className="min-w-[160px] flex-1">
                <CadastroSearchPicker icon={Activity} aria-label="Situação" pluralNoun="situações" searchPlaceholder="Buscar situação..." options={HEALTH_OPTIONS} selected={filters.healths} onSelect={(values) => setFilters((prev) => ({ ...prev, healths: values as EnvironmentFilters["healths"] }))} />
            </FilterGroup>
            <FilterGroup label="Origem" className="min-w-[160px] flex-1">
                <CadastroSearchPicker icon={Boxes} aria-label="Origem" pluralNoun="origens" searchPlaceholder="Buscar origem..." options={ORIGIN_OPTIONS} selected={filters.origins} onSelect={(values) => setFilters((prev) => ({ ...prev, origins: values as EnvironmentFilters["origins"] }))} />
            </FilterGroup>
        </ListFilters>
    )
}
