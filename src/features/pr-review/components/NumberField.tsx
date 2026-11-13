"use client"

import { Controller, type Control, type FieldValues, type Path } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/** Campo numérico ligado ao react-hook-form (vazio vira 0 e a validação acusa); `step` para decimais. */
export function NumberField<T extends FieldValues>({ control, name, id, label, min, max, step, error, disabled }: { control: Control<T>; name: Path<T>; id: string; label: string; min: number; max: number; step?: number; error?: string; disabled?: boolean }) {
    return (
        <Field id={id} label={label} error={error}>
            <Controller
                control={control}
                name={name}
                render={({ field }) => <Input id={id} type="number" min={min} max={max} step={step} disabled={disabled} value={field.value as number} onChange={(event) => field.onChange(event.target.value === "" ? 0 : Number(event.target.value))} />}
            />
        </Field>
    )
}
