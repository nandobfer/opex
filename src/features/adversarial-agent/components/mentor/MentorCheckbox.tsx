"use client"

import { Controller, type FieldPath, type UseFormReturn } from "react-hook-form"
import { Checkbox } from "@/components/ui/checkbox"
import type { MentorSettings } from "../../mentor/schemas"

/** Chave booleana da configuração do Mentor como caixa com rótulo e descrição. */
export function MentorCheckbox({ form, name, id, label, description, disabled }: { form: UseFormReturn<MentorSettings>; name: FieldPath<MentorSettings>; id: string; label: string; description?: string; disabled?: boolean }) {
    return (
        <Controller
            control={form.control}
            name={name}
            render={({ field }) => (
                <li className="flex items-start gap-2 rounded-md border px-3 py-2">
                    <Checkbox id={id} className="mt-0.5" checked={field.value === true} disabled={disabled} onCheckedChange={(next) => field.onChange(next === true)} />
                    <label htmlFor={id} className="min-w-0 flex-1 text-sm">
                        {label}
                        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
                    </label>
                </li>
            )}
        />
    )
}
