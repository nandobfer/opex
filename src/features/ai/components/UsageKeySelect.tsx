"use client"

import { KeyRound } from "lucide-react"
import { FilterGroup } from "@/components/list/FilterGroup"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { UsageKeyOption } from "../usage-key-filter"

/** Período + chave lado a lado nos painéis de consumo com chaveiro. */
export const USAGE_FILTERS_GRID = "grid gap-3 md:grid-cols-2"

/** Seletor do filtro "Chave de API" dos painéis de consumo (fundo do card, como os demais filtros). */
export function UsageKeySelect({ value, options, onChange }: { value: string; options: UsageKeyOption[]; onChange: (value: string) => void }) {
    return (
        <FilterGroup label="Chave de API">
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="h-10 bg-transparent" aria-label="Chave de API">
                    <KeyRound className="mr-2 h-4 w-4 text-primary opacity-50" aria-hidden />
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </FilterGroup>
    )
}
