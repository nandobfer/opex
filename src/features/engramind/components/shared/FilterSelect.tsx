"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ALL = "__all__"

/** Filtro de lista (fundo do card): "Todos" + as opções, cada uma com a explicação no título. */
export function FilterSelect({ id, label, value, options, onChange, help }: { id: string; label: string; value: string | undefined; options: readonly string[]; onChange: (value: string | undefined) => void; help?: Record<string, string> }) {
    return (
        <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? undefined : next)}>
            <SelectTrigger id={id} aria-label={label} className="h-8 w-full bg-transparent text-xs">
                <SelectValue placeholder={label} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>{label}: todos</SelectItem>
                {options.map((option) => (
                    <SelectItem key={option} value={option} title={help?.[option]}>
                        {option}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

/** `AAAA-MM-DD` do campo de data → RFC 3339 (início do dia, ou fim com `end`). */
export const dayToIso = (day: string, end = false) => (day ? new Date(`${day}T${end ? "23:59:59" : "00:00:00"}`).toISOString() : undefined)
