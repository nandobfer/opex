"use client"

import { Controller, type Control, type FieldValues, type Path } from "react-hook-form"
import { Input } from "@/components/ui/input"

/**
 * Campo numérico do react-hook-form (só o `<Input>`; rótulo e erro ficam no `Field` de quem usa): vazio
 * vira `null` (`nullable`, ex.: "sem limite") ou `NaN` (obrigatório: a validação acusa).
 */
export function FormNumberInput<T extends FieldValues>({ control, name, id, nullable, step = 1, min, max, placeholder }: { control: Control<T>; name: Path<T>; id: string; nullable?: boolean; step?: number; min?: number; max?: number; placeholder?: string }) {
    return (
        <Controller
            control={control}
            name={name}
            render={({ field }) => {
                const value = field.value as number | null
                return (
                    <Input
                        id={id}
                        type="number"
                        step={step}
                        min={min}
                        max={max}
                        placeholder={placeholder}
                        value={value === null || value === undefined || Number.isNaN(value) ? "" : value}
                        onChange={(event) => {
                            const raw = event.target.value.trim()
                            field.onChange(raw === "" ? (nullable ? null : Number.NaN) : Number(raw))
                        }}
                    />
                )
            }}
        />
    )
}
